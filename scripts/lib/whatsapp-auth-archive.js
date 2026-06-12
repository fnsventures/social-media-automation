import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { config, ROOT } from "./config.js";

const GITHUB_SECRET_MAX_BYTES = 64 * 1024;

export function normalizeWhatsAppAuthB64(raw) {
  if (!raw) return "";
  return raw
    .replace(/---BEGIN WHATSAPP_AUTH_B64---/g, "")
    .replace(/---END WHATSAPP_AUTH_B64---/g, "")
    .replace(/\s+/g, "");
}

export function decodeWhatsAppAuthArchive(raw) {
  const normalized = normalizeWhatsAppAuthB64(raw);
  if (!normalized) {
    throw new Error(
      "WHATSAPP_AUTH_B64 is empty. Run npm run export:whatsapp-auth on the setup laptop."
    );
  }

  let decoded;
  try {
    decoded = Buffer.from(normalized, "base64");
  } catch {
    throw new Error(
      "WHATSAPP_AUTH_B64 is not valid base64. Re-run npm run export:whatsapp-auth and paste only the encoded string (no BEGIN/END lines)."
    );
  }

  if (decoded.length < 2 || decoded[0] !== 0x1f || decoded[1] !== 0x8b) {
    throw new Error(
      "WHATSAPP_AUTH_B64 is not a gzip tar archive. " +
        "Re-run npm run export:whatsapp-auth on the laptop where setup:whatsapp succeeded, " +
        "then update the GitHub secret with the full output between BEGIN and END (one line, no spaces)."
    );
  }

  return decoded;
}

export function localWhatsAppAuthDir() {
  const localDir = path.resolve(ROOT, config.whatsapp.authDir);
  return fs.existsSync(path.join(localDir, "creds.json")) ? localDir : null;
}

export function whatsappAuthArchiveValid() {
  const localDir = localWhatsAppAuthDir();
  if (localDir) return true;
  if (!config.whatsapp.authB64) return false;

  try {
    decodeWhatsAppAuthArchive(config.whatsapp.authB64);
    return true;
  } catch {
    return false;
  }
}

export function assertWhatsAppAuthArchiveSize(b64Length) {
  if (b64Length > GITHUB_SECRET_MAX_BYTES) {
    throw new Error(
      `WhatsApp auth export is ${b64Length} characters (${GITHUB_SECRET_MAX_BYTES} max for GitHub secrets). ` +
        "Delete whatsapp-auth/ and run npm run setup:whatsapp -- --fresh to create a smaller session."
    );
  }
}

export function extractWhatsAppAuthDir() {
  const localDir = localWhatsAppAuthDir();
  if (localDir) return localDir;

  const decoded = decodeWhatsAppAuthArchive(config.whatsapp.authB64);
  const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), "wa-auth-"));
  const archivePath = path.join(tmpBase, "auth.tgz");
  fs.writeFileSync(archivePath, decoded);

  try {
    execSync(`tar -xzf "${archivePath}" -C "${tmpBase}"`, { stdio: "pipe" });
  } catch {
    throw new Error(
      "WHATSAPP_AUTH_B64 could not be extracted. The archive may be truncated or corrupted. " +
        "Re-run npm run export:whatsapp-auth and update the GitHub secret."
    );
  }

  const nested = path.join(tmpBase, config.whatsapp.authDir);
  if (fs.existsSync(path.join(nested, "creds.json"))) return nested;
  if (fs.existsSync(path.join(tmpBase, "creds.json"))) return tmpBase;

  throw new Error("WhatsApp auth archive is missing creds.json.");
}

export function createWhatsAppAuthArchiveBuffer() {
  const authDirName = config.whatsapp.authDir;
  const credsPath = path.join(ROOT, authDirName, "creds.json");
  if (!fs.existsSync(credsPath)) {
    throw new Error(`${authDirName}/creds.json not found. Run npm run setup:whatsapp first.`);
  }

  return execSync(`tar -czf - ${authDirName}`, {
    cwd: ROOT,
    encoding: "buffer",
    maxBuffer: 50 * 1024 * 1024,
  });
}

export function validateWhatsAppAuthExport(archiveBuffer, b64) {
  decodeWhatsAppAuthArchive(b64);
  const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), "wa-auth-test-"));
  const archivePath = path.join(tmpBase, "auth.tgz");
  fs.writeFileSync(archivePath, archiveBuffer);
  execSync(`tar -xzf "${archivePath}" -C "${tmpBase}"`, { stdio: "pipe" });

  const nested = path.join(tmpBase, config.whatsapp.authDir, "creds.json");
  if (!fs.existsSync(nested)) {
    throw new Error("Export validation failed: creds.json missing from archive.");
  }
}
