#!/usr/bin/env node
/**
 * One-time WhatsApp setup: link the business phone → auth saved to whatsapp-auth/.
 *
 * Usage:
 *   npm run setup:whatsapp              # pairing code (recommended)
 *   npm run setup:whatsapp -- --qr      # QR code instead
 *   npm run setup:whatsapp -- --fresh   # wipe whatsapp-auth/ and start over
 *
 * For GitHub Actions, add WHATSAPP_AUTH_B64:
 *   tar -czf - whatsapp-auth | base64 | pbcopy
 */
import fs from "node:fs";
import path from "node:path";
import makeWASocket, {
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
} from "@whiskeysockets/baileys";
import pino from "pino";
import qrcode from "qrcode-terminal";
import { loadEnvFile, upsertEnvValue } from "./lib/load-env.js";
import { formatPairingCode, phoneMatchesBusiness } from "./lib/whatsapp-phone.js";
import { ROOT } from "./lib/config.js";

loadEnvFile();

const AUTH_DIR = path.join(ROOT, "whatsapp-auth");
const SETUP_TIMEOUT_MS = 5 * 60_000;

function readEnv(name) {
  return (process.env[name] ?? "").trim();
}

function parseArgs(argv) {
  return {
    fresh: argv.includes("--fresh"),
    useQr: argv.includes("--qr"),
  };
}

function wipeAuthDir() {
  if (fs.existsSync(AUTH_DIR)) {
    fs.rmSync(AUTH_DIR, { recursive: true, force: true });
  }
}

async function linkBusinessAccount(businessNumber, { useQr }) {
  let currentSock = null;
  let pairingCodeSent = false;
  let finished = false;

  const closeCurrentSocket = () => {
    if (!currentSock) return;
    try {
      currentSock.end(undefined);
    } catch {
      // ignore cleanup errors
    }
    currentSock = null;
  };

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (finished) return;
      finished = true;
      closeCurrentSocket();
      reject(
        new Error(
          "WhatsApp setup timed out. Run with --fresh and try again.\n" +
            "Tip: pairing code is more reliable than QR for business numbers."
        )
      );
    }, SETUP_TIMEOUT_MS);

    const finish = (error, phone) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      closeCurrentSocket();
      if (error) reject(error);
      else resolve(phone);
    };

    const start = async () => {
      const { version } = await fetchLatestBaileysVersion();
      const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
      const logger = pino({ level: "silent" });

      const sock = makeWASocket({
        version,
        auth: state,
        logger,
        browser: Browsers.macOS("Bishnupriya Fuels"),
        markOnlineOnConnect: false,
        syncFullHistory: false,
      });

      currentSock = sock;
      sock.ev.on("creds.update", saveCreds);

      sock.ev.on("connection.update", (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr && useQr) {
          console.log("\nScan this QR code on +91 96689 13299:\n");
          qrcode.generate(qr, { small: true });
          console.log("\nWhatsApp → Settings → Linked devices → Link a device\n");
        }

        if (connection === "open") {
          const phone = sock.user?.id?.split(":")[0] ?? "unknown";
          if (!phoneMatchesBusiness(phone, businessNumber)) {
            finish(
              new Error(
                `Connected as ${phone}, but WHATSAPP_BUSINESS_NUMBER is ${businessNumber}. ` +
                  "Run with --fresh and link the business phone."
              )
            );
            return;
          }
          finish(null, phone);
          return;
        }

        if (connection !== "close") return;

        const statusCode = lastDisconnect?.error?.output?.statusCode;
        if (statusCode === DisconnectReason.loggedOut) {
          finish(new Error("Logged out during setup. Run with --fresh and try again."));
          return;
        }

        if (statusCode === DisconnectReason.restartRequired) {
          console.log("Pairing accepted on your phone — reconnecting session...");
          closeCurrentSocket();
          start().catch((error) => finish(error));
          return;
        }

        console.log(
          `Connection interrupted (${lastDisconnect?.error?.message ?? "unknown"}). Reconnecting...`
        );
        closeCurrentSocket();
        start().catch((error) => finish(error));
      });

      if (!useQr && !state.creds.registered && !pairingCodeSent) {
        pairingCodeSent = true;
        console.log("Connecting to WhatsApp...");
        await sock.waitForSocketOpen();
        const code = await sock.requestPairingCode(businessNumber);
        console.log("\nEnter this pairing code on your business phone:\n");
        console.log(`  ${formatPairingCode(code)}\n`);
        console.log("WhatsApp → Settings → Linked devices");
        console.log("→ Link a device → Link with phone number instead\n");
        console.log("Waiting for confirmation on the phone...\n");
      } else if (useQr && !state.creds.registered) {
        console.log("Connecting to WhatsApp... (waiting for QR)\n");
      } else if (state.creds.registered) {
        console.log("Restoring saved session...\n");
      }
    };

    start().catch((error) => finish(error));
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const businessNumber = readEnv("WHATSAPP_BUSINESS_NUMBER");
  if (!businessNumber) {
    throw new Error(
      "Set WHATSAPP_BUSINESS_NUMBER in .env first.\n" +
        "Example: WHATSAPP_BUSINESS_NUMBER=919668913299"
    );
  }

  const statusAudience = readEnv("WHATSAPP_STATUS_AUDIENCE") || "all_contacts";

  if (args.fresh) {
    wipeAuthDir();
  } else if (fs.existsSync(AUTH_DIR) && !fs.existsSync(path.join(AUTH_DIR, "creds.json"))) {
    wipeAuthDir();
  }

  fs.mkdirSync(AUTH_DIR, { recursive: true });

  console.log("WhatsApp Status setup\n");
  console.log(`Business number: +${businessNumber.replace(/^(\d{2})/, "$1 ")}`);
  console.log("Status audience: all saved contacts on this phone");
  console.log(
    args.useQr
      ? "Method: QR code (use --fresh if a previous scan got stuck)\n"
      : "Method: pairing code (add --qr to use QR instead)\n"
  );

  process.stdin.resume();

  const phone = await linkBusinessAccount(businessNumber, { useQr: args.useQr });
  console.log(`\nLinked as ${phone}`);

  upsertEnvValue("WHATSAPP_AUTH_DIR", "whatsapp-auth");
  upsertEnvValue("WHATSAPP_BUSINESS_NUMBER", businessNumber);
  upsertEnvValue("WHATSAPP_STATUS_AUDIENCE", statusAudience);

  console.log("\nSaved session to whatsapp-auth/");
  console.log("\nAdd these GitHub Secrets:\n");
  console.log("  WHATSAPP_BUSINESS_NUMBER");
  console.log("  WHATSAPP_STATUS_AUDIENCE");
  console.log("  WHATSAPP_AUTH_B64\n");
  console.log("Create WHATSAPP_AUTH_B64:\n");
  console.log("  tar -czf - whatsapp-auth | base64 | pbcopy\n");
  console.log("Verify locally:\n  npm run verify\n");
}

main().catch((error) => {
  console.error("\nSetup failed:", error.message);
  process.exit(1);
});
