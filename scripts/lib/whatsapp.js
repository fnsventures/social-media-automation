import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
} from "@whiskeysockets/baileys";
import pino from "pino";
import { config, ROOT } from "./config.js";
import { normalizeWhatsAppDigits, phoneMatchesBusiness } from "./whatsapp-phone.js";

export { normalizeWhatsAppDigits, phoneMatchesBusiness } from "./whatsapp-phone.js";

const CONNECTION_TIMEOUT_MS = 60_000;
const CONTACT_SYNC_TIMEOUT_MS = 25_000;

function resolveAuthDir() {
  const localDir = path.resolve(ROOT, config.whatsapp.authDir);
  if (fs.existsSync(path.join(localDir, "creds.json"))) {
    return localDir;
  }

  const archive = config.whatsapp.authB64;
  if (!archive) {
    throw new Error(
      "WhatsApp auth not configured. Run npm run setup:whatsapp locally or set WHATSAPP_AUTH_B64."
    );
  }

  const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), "wa-auth-"));
  const archivePath = path.join(tmpBase, "auth.tgz");
  fs.writeFileSync(archivePath, Buffer.from(archive, "base64"));
  execSync(`tar -xzf "${archivePath}" -C "${tmpBase}"`, { stdio: "pipe" });

  const nested = path.join(tmpBase, "whatsapp-auth");
  if (fs.existsSync(path.join(nested, "creds.json"))) return nested;
  if (fs.existsSync(path.join(tmpBase, "creds.json"))) return tmpBase;

  throw new Error("WhatsApp auth archive is missing creds.json.");
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

async function collectAllContactJids(sock) {
  const jids = new Set();

  const addContacts = (list) => {
    for (const contact of list ?? []) {
      const id = typeof contact === "string" ? contact : contact?.id;
      if (typeof id === "string" && id.endsWith("@s.whatsapp.net")) {
        jids.add(id);
      }
    }
  };

  sock.ev.on("contacts.upsert", addContacts);
  sock.ev.on("contacts.update", addContacts);

  const deadline = Date.now() + CONTACT_SYNC_TIMEOUT_MS;
  while (jids.size === 0 && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  if (jids.size === 0) {
    throw new Error(
      "No WhatsApp contacts synced for status broadcast. Save customer contacts on the business phone " +
        `(+${config.whatsapp.businessNumber}), or set WHATSAPP_STATUS_AUDIENCE=contacts with WHATSAPP_STATUS_CONTACTS.`
    );
  }

  return [...jids];
}

async function resolveStatusJidList(sock) {
  if (config.whatsapp.statusAudience === "all_contacts") {
    return collectAllContactJids(sock);
  }
  return buildStatusJidListFromConfig(sock);
}

async function connectWhatsApp() {
  const authDir = resolveAuthDir();
  const { state, saveCreds } = await useMultiFileAuthState(authDir);
  const logger = pino({ level: "silent" });

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
      auth: state,
      logger,
      printQRInTerminal: false,
    });

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

      finish(
        new Error(
          `WhatsApp connection failed: ${lastDisconnect?.error?.message ?? "unknown error"}`
        )
      );
    });
  });
}

async function disconnectWhatsApp(sock) {
  try {
    sock.end(undefined);
  } catch {
    // ignore cleanup errors
  }
}

function assertBusinessAccount(sock) {
  const connected = sock.user?.id?.split(":")[0] ?? "";
  if (!phoneMatchesBusiness(connected, config.whatsapp.businessNumber)) {
    throw new Error(
      `WhatsApp connected as ${connected || "unknown"}, expected business number ` +
        `${config.whatsapp.businessNumber}. Run npm run setup:whatsapp on the business phone.`
    );
  }
}

export async function publishToWhatsApp(post) {
  if (!post.imagePath && !post.videoPath) {
    throw new Error("WhatsApp Status requires media.image or media.video.");
  }

  const sock = await connectWhatsApp();

  try {
    assertBusinessAccount(sock);
    const statusJidList = await resolveStatusJidList(sock);
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

export async function verifyWhatsAppCredentials() {
  const sock = await connectWhatsApp();
  try {
    const phone = sock.user?.id?.split(":")[0] ?? "connected";
    assertBusinessAccount(sock);
    return phone;
  } finally {
    await disconnectWhatsApp(sock);
  }
}
