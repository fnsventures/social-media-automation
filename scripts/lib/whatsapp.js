import fs from "node:fs";
import path from "node:path";
import makeWASocket, {
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  useMultiFileAuthState,
} from "@whiskeysockets/baileys";
import pino from "pino";
import { config } from "./config.js";
import { extractWhatsAppAuthDir } from "./whatsapp-auth-archive.js";
import {
  createContactCollector,
  loadStatusViewers,
  mergeStatusViewerJids,
  saveStatusViewers,
} from "./whatsapp-contacts.js";
import {
  normalizeWhatsAppDigits,
  phoneMatchesBusiness,
  readLinkedPhone,
} from "./whatsapp-phone.js";

export { normalizeWhatsAppDigits, phoneMatchesBusiness } from "./whatsapp-phone.js";

const CONNECTION_TIMEOUT_MS = 60_000;
const CONTACT_SYNC_TIMEOUT_MS = 45_000;
const STATUS_VIEWER_SYNC_TIMEOUT_MS = 90_000;
const MAX_CONNECT_ATTEMPTS = 5;

const SOCKET_OPTIONS = {
  markOnlineOnConnect: false,
  connectTimeoutMs: 60_000,
  syncFullHistory: true,
};

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveAuthDir() {
  return extractWhatsAppAuthDir();
}

function normalizeJid(value) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.includes("@")) return trimmed;
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return null;
  return `${digits}@s.whatsapp.net`;
}

function buildStatusJidListFromConfig(sock) {
  const jids = config.whatsapp.statusContacts
    .map(normalizeJid)
    .filter(Boolean);

  if (sock.user?.id && !jids.includes(sock.user.id)) {
    jids.unshift(sock.user.id);
  }

  if (jids.length === 0) {
    throw new Error(
      "WHATSAPP_STATUS_CONTACTS is empty. Add numbers or set WHATSAPP_STATUS_AUDIENCE=all_contacts."
    );
  }

  return jids;
}

async function collectAllContactJids(sock, authDir) {
  const collector = sock._contactCollector ?? createContactCollector();
  const saved = loadStatusViewers(authDir);
  const live = await collector.waitForJids(CONTACT_SYNC_TIMEOUT_MS);
  const jids = mergeStatusViewerJids(saved, live);

  if (jids.length === 0) {
    throw new Error(
      "No WhatsApp viewers found for status broadcast. " +
        "WhatsApp cannot list everyone who saved your business number, but anyone who has " +
        "messaged you or is in your phone contacts can be included. " +
        "On the business phone: open a few customer chats, then run npm run sync:whatsapp-contacts " +
        "and re-export WHATSAPP_AUTH_B64. Also confirm Settings → Privacy → Status → My contacts."
    );
  }

  return jids;
}

async function resolveStatusJidList(sock, authDir) {
  if (config.whatsapp.statusAudience === "all_contacts") {
    return collectAllContactJids(sock, authDir);
  }
  return buildStatusJidListFromConfig(sock);
}

async function openWhatsAppSocket(authDir) {
  const { version } = await fetchLatestBaileysVersion();
  const { state, saveCreds } = await useMultiFileAuthState(authDir);
  const logger = pino({ level: "silent" });
  const collector = createContactCollector();

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(value);
    };

    const sock = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger),
      },
      logger,
      browser: Browsers.ubuntu("Chrome"),
      ...SOCKET_OPTIONS,
    });

    collector.attach(sock);
    sock._contactCollector = collector;

    sock.ev.on("creds.update", saveCreds);

    const timer = setTimeout(() => {
      try {
        sock.end(undefined);
      } catch {
        // ignore cleanup errors
      }
      finish(new Error("WhatsApp connection timed out."));
    }, CONNECTION_TIMEOUT_MS);

    sock.ev.on("connection.update", (update) => {
      const { connection, lastDisconnect } = update;

      if (connection === "open") {
        finish(null, sock);
        return;
      }

      if (connection !== "close" || settled) return;

      const statusCode = lastDisconnect?.error?.output?.statusCode;
      if (statusCode === DisconnectReason.loggedOut) {
        finish(
          new Error(
            "WhatsApp session logged out. Run npm run setup:whatsapp and update WHATSAPP_AUTH_B64."
          )
        );
        return;
      }

      if (statusCode === DisconnectReason.restartRequired) {
        finish(null, { restart: true });
        return;
      }

      finish(
        new Error(
          `WhatsApp connection failed: ${lastDisconnect?.error?.message ?? "unknown error"}`
        )
      );
    });
  });
}

async function connectWhatsApp() {
  const authDir = resolveAuthDir();

  for (let attempt = 1; attempt <= MAX_CONNECT_ATTEMPTS; attempt += 1) {
    const result = await openWhatsAppSocket(authDir);
    if (result.restart) {
      await delay(1500);
      continue;
    }
    return { sock: result, authDir };
  }

  throw new Error("WhatsApp connection failed after several retries.");
}

async function disconnectWhatsApp(sock) {
  try {
    sock.end(undefined);
  } catch {
    // ignore cleanup errors
  }
}

function assertBusinessAccount(sock) {
  const connected = readLinkedPhone(sock);
  if (phoneMatchesBusiness(connected, config.whatsapp.businessNumber)) return;

  const meDigits = normalizeWhatsAppDigits(
    String(sock.authState?.creds?.me?.id ?? "").split("@")[0]
  );
  if (phoneMatchesBusiness(meDigits, config.whatsapp.businessNumber)) return;

  throw new Error(
    `WhatsApp connected as ${connected || "unknown"}, expected business number ` +
      `${config.whatsapp.businessNumber}. Run npm run setup:whatsapp on the business phone.`
  );
}

export async function publishToWhatsApp(post) {
  if (!post.imagePath && !post.videoPath) {
    throw new Error("WhatsApp Status requires media.image or media.video.");
  }

  const { sock, authDir } = await connectWhatsApp();

  try {
    assertBusinessAccount(sock);
    const statusJidList = await resolveStatusJidList(sock, authDir);
    const options = { broadcast: true, statusJidList };

    if (post.imagePath) {
      await sock.sendMessage(
        "status@broadcast",
        {
          image: fs.readFileSync(post.imagePath),
          caption: post.caption,
        },
        options
      );
    } else {
      await sock.sendMessage(
        "status@broadcast",
        {
          video: fs.readFileSync(post.videoPath),
          caption: post.caption,
        },
        options
      );
    }

    return {
      platform: "whatsapp",
      id: "status",
      url: null,
      recipients: statusJidList.length,
    };
  } finally {
    await disconnectWhatsApp(sock);
  }
}

export async function syncWhatsAppStatusViewers() {
  const { sock, authDir } = await connectWhatsApp();

  try {
    assertBusinessAccount(sock);
    const live = await sock._contactCollector.waitForJids(STATUS_VIEWER_SYNC_TIMEOUT_MS);
    const merged = mergeStatusViewerJids(loadStatusViewers(authDir), live);

    if (merged.length === 0) {
      throw new Error(
        "No viewers found yet. On the business phone, open WhatsApp Business and scroll " +
          "through customer chats (anyone who messaged you is included). " +
          "Then run this command again."
      );
    }

    const count = saveStatusViewers(authDir, merged);
    return count;
  } finally {
    await disconnectWhatsApp(sock);
  }
}

export async function verifyWhatsAppCredentials() {
  const { sock, authDir } = await connectWhatsApp();
  try {
    assertBusinessAccount(sock);
    if (config.whatsapp.statusAudience === "all_contacts") {
      const saved = loadStatusViewers(authDir);
      if (saved.length === 0) {
        console.warn(
          "WhatsApp: no saved viewers yet. Run npm run sync:whatsapp-contacts after opening customer chats on the business phone."
        );
      }
    }
    return readLinkedPhone(sock) || config.whatsapp.businessNumber;
  } finally {
    await disconnectWhatsApp(sock);
  }
}
