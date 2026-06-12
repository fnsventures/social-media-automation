#!/usr/bin/env node
/**
 * One-time WhatsApp setup: link the business phone → auth saved to whatsapp-auth/.
 *
 * Prerequisites:
 * 1. Set WHATSAPP_BUSINESS_NUMBER in .env (country code, no +)
 *    Example: 919668913299 for +91 96689 13299
 * 2. Link using the 8-digit pairing code shown in the terminal
 *
 * Run: npm run setup:whatsapp
 *
 * For GitHub Actions, add the base64 auth archive as WHATSAPP_AUTH_B64:
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
const SOCKET_TIMEOUT_MS = 45_000;

function readEnv(name) {
  return (process.env[name] ?? "").trim();
}

function resetAuthDirIfIncomplete() {
  const credsPath = path.join(AUTH_DIR, "creds.json");
  if (!fs.existsSync(AUTH_DIR)) return;
  if (fs.existsSync(credsPath)) return;

  fs.rmSync(AUTH_DIR, { recursive: true, force: true });
}

async function waitForLogin(sock) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("WhatsApp setup timed out. Try again.")),
      SETUP_TIMEOUT_MS
    );

    sock.ev.on("connection.update", (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        console.log("\nOr scan this QR code instead:\n");
        qrcode.generate(qr, { small: true });
      }

      if (connection === "open") {
        clearTimeout(timer);
        resolve();
        return;
      }

      if (connection !== "close") return;

      const statusCode = lastDisconnect?.error?.output?.statusCode;
      if (statusCode === DisconnectReason.restartRequired) return;
      if (statusCode === DisconnectReason.loggedOut) {
        clearTimeout(timer);
        reject(new Error("Logged out during setup. Delete whatsapp-auth/ and try again."));
        return;
      }

      clearTimeout(timer);
      reject(
        new Error(`Connection closed: ${lastDisconnect?.error?.message ?? "unknown error"}`)
      );
    });
  });
}

async function waitForSocket(sock) {
  await Promise.race([
    sock.waitForSocketOpen(),
    new Promise((_, reject) => {
      setTimeout(() => {
        reject(
          new Error(
            "Could not reach WhatsApp servers within 45 seconds. " +
              "Check your internet connection and ensure https://web.whatsapp.com is not blocked."
          )
        );
      }, SOCKET_TIMEOUT_MS);
    }),
  ]);
}

async function connectBusinessAccount(businessNumber) {
  const { version } = await fetchLatestBaileysVersion();
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const logger = pino({ level: "silent" });

  const sock = makeWASocket({
    version,
    auth: state,
    logger,
    browser: Browsers.macOS("Bishnupriya Fuels"),
    markOnlineOnConnect: false,
    connectTimeoutMs: SOCKET_TIMEOUT_MS,
  });

  sock.ev.on("creds.update", saveCreds);

  console.log("Connecting to WhatsApp...");
  await waitForSocket(sock);
  console.log("Connected to WhatsApp servers.");

  if (!state.creds.registered) {
    const code = await sock.requestPairingCode(businessNumber);
    console.log("\nEnter this pairing code on your business phone:\n");
    console.log(`  ${formatPairingCode(code)}\n`);
    console.log("WhatsApp → Settings → Linked devices");
    console.log("→ Link a device → Link with phone number instead\n");
    console.log("Waiting for you to confirm on the phone...\n");
  } else {
    console.log("Restoring existing WhatsApp session...\n");
  }

  await waitForLogin(sock);

  const phone = sock.user?.id?.split(":")[0] ?? "unknown";
  if (!phoneMatchesBusiness(phone, businessNumber)) {
    await sock.logout("wrong account");
    throw new Error(
      `Connected as ${phone}, but WHATSAPP_BUSINESS_NUMBER is ${businessNumber}. ` +
        "Delete whatsapp-auth/ and run setup again on the business phone."
    );
  }

  try {
    sock.end(undefined);
  } catch {
    // ignore cleanup errors
  }

  return phone;
}

async function main() {
  const businessNumber = readEnv("WHATSAPP_BUSINESS_NUMBER");
  if (!businessNumber) {
    throw new Error(
      "Set WHATSAPP_BUSINESS_NUMBER in .env first.\n" +
        "Example: WHATSAPP_BUSINESS_NUMBER=919668913299"
    );
  }

  const statusAudience = readEnv("WHATSAPP_STATUS_AUDIENCE") || "all_contacts";

  resetAuthDirIfIncomplete();
  fs.mkdirSync(AUTH_DIR, { recursive: true });

  console.log("WhatsApp Status setup\n");
  console.log(`Business number: +${businessNumber.replace(/^(\d{2})/, "$1 ")}`);
  console.log("Status audience: all saved contacts on this phone\n");

  process.stdin.resume();

  const phone = await connectBusinessAccount(businessNumber);
  console.log(`\nLinked as ${phone}`);

  upsertEnvValue("WHATSAPP_AUTH_DIR", "whatsapp-auth");
  upsertEnvValue("WHATSAPP_BUSINESS_NUMBER", businessNumber);
  upsertEnvValue("WHATSAPP_STATUS_AUDIENCE", statusAudience);

  console.log("\nSaved session to whatsapp-auth/");
  console.log("\nAdd these GitHub Secrets:\n");
  console.log("  WHATSAPP_BUSINESS_NUMBER");
  console.log("  WHATSAPP_STATUS_AUDIENCE");
  console.log("  WHATSAPP_AUTH_B64  (create with the command below)\n");
  console.log("Create WHATSAPP_AUTH_B64:\n");
  console.log("  tar -czf - whatsapp-auth | base64 | pbcopy\n");
  console.log("Verify locally:\n  npm run verify\n");
}

main().catch((error) => {
  console.error("\nSetup failed:", error.message);
  process.exit(1);
});
