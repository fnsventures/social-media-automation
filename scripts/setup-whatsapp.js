#!/usr/bin/env node
/**
 * One-time WhatsApp setup: link the business phone → auth saved to whatsapp-auth/.
 *
 * Usage:
 *   npm run setup:whatsapp              # pairing code (recommended)
 *   npm run setup:whatsapp -- --qr      # QR code instead
 *   npm run setup:whatsapp -- --fresh   # wipe whatsapp-auth/ and start over
 */
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
import qrcode from "qrcode-terminal";
import { loadEnvFile, upsertEnvValue } from "./lib/load-env.js";
import { formatPairingCode, phoneMatchesBusiness } from "./lib/whatsapp-phone.js";
import { ROOT } from "./lib/config.js";

loadEnvFile();

const AUTH_DIR = path.join(ROOT, "whatsapp-auth");
const QR_HTML_PATH = path.join(ROOT, "whatsapp-setup-qr.html");
const SETUP_TIMEOUT_MS = 5 * 60_000;
const RECONNECT_DELAY_MS = 5_000;

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

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  <script src="https://cdn.jsdelivr.net/npm/qrcode@1/build/qrcode.min.js"></script>
  <script>
    QRCode.toCanvas(document.getElementById("qr"), ${JSON.stringify(qr)}, { width: 360, margin: 2 });
  </script>
</body>
</html>
`;
  fs.writeFileSync(QR_HTML_PATH, html, "utf8");
}

async function linkBusinessAccount(businessNumber, { useQr }) {
  let reconnects = 0;
  let instructionsShown = false;
  const deadline = Date.now() + SETUP_TIMEOUT_MS;

  const ensureTimeRemaining = () => {
    if (Date.now() >= deadline) {
      throw new Error(
        "WhatsApp setup timed out. Run with --fresh and try again.\n" +
          "Enter the pairing code within a minute of it appearing."
      );
    }
  };

  async function attempt() {
    ensureTimeRemaining();

    const { version } = await fetchLatestBaileysVersion();
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    const logger = pino({ level: "warn" });

    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (error, phone) => {
        if (settled) return;
        settled = true;
        if (error) reject(error);
        else resolve(phone);
      };

      const sock = makeWASocket({
        version,
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, logger),
        },
        logger,
        browser: Browsers.ubuntu("Chrome"),
        markOnlineOnConnect: false,
        qrTimeout: 120_000,
        connectTimeoutMs: 60_000,
      });

      sock.ev.on("creds.update", saveCreds);

      sock.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr && useQr) {
          writeQrHtml(qr);
          console.log("\nScan this QR code with your business phone:\n");
          qrcode.generate(qr, { small: false });
          console.log(`\nOr open a larger QR in your browser:\n  open ${QR_HTML_PATH}\n`);
          if (!instructionsShown) {
            instructionsShown = true;
            printLinkingInstructions("qr");
          }
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
          try {
            sock.end(undefined);
          } catch {
            // ignore cleanup errors
          }
          finish(null, phone);
          return;
        }

        if (connection !== "close" || settled) return;

        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const reason = lastDisconnect?.error?.message ?? "unknown error";

        if (statusCode === DisconnectReason.loggedOut) {
          finish(new Error("Logged out during setup. Run with --fresh and try again."));
          return;
        }

        if (statusCode === DisconnectReason.restartRequired) {
          console.log("\nPairing accepted on your phone — finishing setup...");
          try {
            finish(null, await attempt());
          } catch (error) {
            finish(error);
          }
          return;
        }

        reconnects += 1;
        if (reconnects > 12) {
          finish(
            new Error(
              "Too many reconnects. Try: npm run setup:whatsapp -- --fresh\n" +
                "Or QR mode: npm run setup:whatsapp:qr"
            )
          );
          return;
        }

        const pendingCode = sock.authState.creds.pairingCode;
        if (!useQr && pendingCode) {
          console.log(
            `\nConnection paused (${reason}). Use the same pairing code:\n\n` +
              `  ${formatPairingCode(pendingCode)}\n\n` +
              `Retrying in ${RECONNECT_DELAY_MS / 1000}s — keep this terminal open.\n`
          );
        } else {
          console.log(
            `\nConnection paused (${reason}). Retrying in ${RECONNECT_DELAY_MS / 1000}s...\n`
          );
        }

        await delay(RECONNECT_DELAY_MS);
        try {
          finish(null, await attempt());
        } catch (error) {
          finish(error);
        }
      });

      (async () => {
        try {
          if (!useQr && !state.creds.registered) {
            if (!instructionsShown) {
              instructionsShown = true;
              console.log("Connecting to WhatsApp...");
              printLinkingInstructions("pairing");
            }
            await sock.waitForSocketOpen();

            if (!sock.authState.creds.pairingCode) {
              const code = await sock.requestPairingCode(businessNumber);
              console.log("\nEnter this pairing code on your business phone:\n");
              console.log(`  ${formatPairingCode(code)}\n`);
              console.log("Enter within 60 seconds. Keep this terminal open.\n");
            } else {
              console.log(
                `\nEnter this pairing code on your business phone:\n\n` +
                  `  ${formatPairingCode(sock.authState.creds.pairingCode)}\n`
              );
            }
          } else if (useQr && !state.creds.registered && !instructionsShown) {
            instructionsShown = true;
            console.log("Connecting to WhatsApp... (waiting for QR)\n");
            printLinkingInstructions("qr");
          } else if (state.creds.registered) {
            console.log("Restoring saved session...\n");
          }
        } catch (error) {
          finish(error);
        }
      })();
    });
  }

  return attempt();
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
