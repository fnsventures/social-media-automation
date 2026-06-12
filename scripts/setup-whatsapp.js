#!/usr/bin/env node
/**
 * One-time WhatsApp setup: link the business phone → auth saved to whatsapp-auth/.
 *
 * Prerequisites:
 * 1. Set WHATSAPP_BUSINESS_NUMBER in .env (country code, no +)
 *    Example: 919668913299 for +91 96689 13299
 * 2. Scan the QR code shown in the terminal (set WHATSAPP_SETUP_METHOD=pairing for code instead)
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
const QR_HTML_PATH = path.join(ROOT, "whatsapp-setup-qr.html");
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

function printLinkingInstructions(setupMethod) {
  console.log("IMPORTANT — do NOT use Business Tools → Short link");
  console.log("Short link QR is for customers to message you. It will NOT link this setup.\n");
  console.log("Use Linked devices instead:\n");
  console.log("Android (WhatsApp Business):");
  console.log("  ⋮ (top-right) → Linked devices → Link a device");
  if (setupMethod === "pairing") {
    console.log("  → tap Link with phone number instead → enter the 8-digit code below\n");
  } else {
    console.log("  → scan the QR code in this terminal or open whatsapp-setup-qr.html\n");
  }
  console.log("iPhone (WhatsApp Business):");
  console.log("  Settings → Linked devices → Link a device");
  if (setupMethod === "pairing") {
    console.log("  → Link with phone number instead → enter the 8-digit code below\n");
  } else {
    console.log("  → scan the QR code in this terminal or open whatsapp-setup-qr.html\n");
  }
}

function writeQrHtml(qr) {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>WhatsApp Setup QR</title>
  <style>
    body { font-family: system-ui, sans-serif; text-align: center; padding: 2rem; }
    canvas { margin: 1rem auto; }
    p { max-width: 32rem; margin: 0.5rem auto; line-height: 1.5; }
  </style>
</head>
<body>
  <h1>Scan with WhatsApp Business</h1>
  <p>Linked devices → Link a device. Do <strong>not</strong> use Business Tools → Short link.</p>
  <canvas id="qr"></canvas>
  <p>QR refreshes if this page fails — re-run <code>npm run setup:whatsapp</code>.</p>
  <script src="https://cdn.jsdelivr.net/npm/qrcode@1/build/qrcode.min.js"></script>
  <script>
    QRCode.toCanvas(document.getElementById("qr"), ${JSON.stringify(qr)}, { width: 360, margin: 2 });
  </script>
</body>
</html>
`;
  fs.writeFileSync(QR_HTML_PATH, html, "utf8");
}

async function waitForLogin(sock, setupMethod) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("WhatsApp setup timed out. Try again.")),
      SETUP_TIMEOUT_MS
    );

    sock.ev.on("connection.update", (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        writeQrHtml(qr);
        console.log("\nScan this QR code with your business phone:\n");
        qrcode.generate(qr, { small: false });
        console.log(`\nOr open a larger QR in your browser:\n  open ${QR_HTML_PATH}\n`);
        printLinkingInstructions(setupMethod);
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

  const setupMethod = (readEnv("WHATSAPP_SETUP_METHOD") || "qr").toLowerCase();

  if (!state.creds.registered) {
    if (setupMethod === "pairing") {
      printLinkingInstructions("pairing");
      const code = await sock.requestPairingCode(businessNumber);
      console.log("\nEnter this pairing code on your business phone:\n");
      console.log(`  ${formatPairingCode(code)}\n`);
      console.log("Waiting for you to confirm on the phone...\n");
    } else {
      console.log("\nWaiting for QR code...\n");
      printLinkingInstructions("qr");
    }
  } else {
    console.log("Restoring existing WhatsApp session...\n");
  }

  await waitForLogin(sock, setupMethod);

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
