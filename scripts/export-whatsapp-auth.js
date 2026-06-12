#!/usr/bin/env node
/**
 * Export whatsapp-auth/ as base64 for WHATSAPP_AUTH_B64 GitHub secret.
 *
 * Run on the laptop where npm run setup:whatsapp succeeded:
 *   npm run export:whatsapp-auth
 *
 * Copy the output into GitHub → Settings → Secrets → WHATSAPP_AUTH_B64
 * Or push directly: npm run export:whatsapp-auth -- --gh
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./lib/config.js";
import {
  assertWhatsAppAuthArchiveSize,
  createWhatsAppAuthArchiveBuffer,
  normalizeWhatsAppAuthB64,
  validateWhatsAppAuthExport,
} from "./lib/whatsapp-auth-archive.js";
import { loadStatusViewers } from "./lib/whatsapp-contacts.js";

function pushToGitHub(b64) {
  const tmpFile = path.join(ROOT, ".whatsapp-auth-b64.tmp");
  fs.writeFileSync(tmpFile, b64, "utf8");

  try {
    const result = spawnSync("gh", ["secret", "set", "WHATSAPP_AUTH_B64", "--body-file", tmpFile], {
      cwd: ROOT,
      encoding: "utf8",
    });
    if (result.status !== 0) {
      throw new Error(result.stderr?.trim() || "gh secret set failed");
    }
    console.log("Updated GitHub secret WHATSAPP_AUTH_B64 via gh CLI.");
  } finally {
    fs.rmSync(tmpFile, { force: true });
  }
}

function main() {
  const useGh = process.argv.includes("--gh");

  const authDir = path.join(ROOT, "whatsapp-auth");
  const viewerCount = loadStatusViewers(authDir).length;
  if (viewerCount === 0) {
    console.warn(
      "Warning: whatsapp-auth/status-viewers.json is missing or empty.\n" +
        "Run npm run sync:whatsapp-contacts before exporting, or status posts will fail in CI.\n"
    );
  }

  const archive = createWhatsAppAuthArchiveBuffer();
  const b64 = archive.toString("base64");
  const normalized = normalizeWhatsAppAuthB64(b64);

  validateWhatsAppAuthExport(archive, normalized);
  assertWhatsAppAuthArchiveSize(normalized.length);

  console.log(
    `Archive OK (${archive.length} bytes → ${normalized.length} base64 chars, ${viewerCount} status viewers)\n`
  );

  if (useGh) {
    pushToGitHub(normalized);
    return;
  }

  console.log("Copy everything below this line into GitHub secret WHATSAPP_AUTH_B64:\n");
  console.log("---BEGIN WHATSAPP_AUTH_B64---");
  console.log(normalized);
  console.log("---END WHATSAPP_AUTH_B64---\n");
  console.log("GitHub: repo → Settings → Secrets and variables → Actions → WHATSAPP_AUTH_B64");
  console.log("Value: paste only the long string between BEGIN and END (one line, no spaces).");
  console.log("\nOr push automatically (requires gh CLI): npm run export:whatsapp-auth -- --gh");
}

main();
