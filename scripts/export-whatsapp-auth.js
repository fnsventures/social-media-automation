#!/usr/bin/env node
/**
 * Export whatsapp-auth/ as base64 for WHATSAPP_AUTH_B64 GitHub secret.
 *
 * Run on the laptop where npm run setup:whatsapp succeeded:
 *   npm run export:whatsapp-auth
 *
 * Copy the output into GitHub → Settings → Secrets → WHATSAPP_AUTH_B64
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./lib/config.js";

const AUTH_DIR = path.join(ROOT, "whatsapp-auth");
const CREDS = path.join(AUTH_DIR, "creds.json");

function main() {
  if (!fs.existsSync(CREDS)) {
    console.error("whatsapp-auth/creds.json not found.\n");
    console.error("Run npm run setup:whatsapp on the laptop that linked WhatsApp first.");
    console.error("This command must run in the project folder on that same laptop.");
    process.exit(1);
  }

  const archive = execSync(`tar -czf - whatsapp-auth`, {
    cwd: ROOT,
    encoding: "buffer",
    maxBuffer: 50 * 1024 * 1024,
  });

  const b64 = archive.toString("base64");

  console.log("Copy everything below this line into GitHub secret WHATSAPP_AUTH_B64:\n");
  console.log("---BEGIN WHATSAPP_AUTH_B64---");
  console.log(b64);
  console.log("---END WHATSAPP_AUTH_B64---\n");
  console.log("GitHub: repo → Settings → Secrets and variables → Actions → New secret");
  console.log("Name: WHATSAPP_AUTH_B64");
  console.log("Value: paste the long string between BEGIN and END (one line, no spaces).");
}

main();
