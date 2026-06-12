#!/usr/bin/env node
/**
 * Refresh whatsapp-auth/status-viewers.json from the linked business phone.
 *
 * Includes phone contacts AND anyone who has messaged the business (typical customers
 * who saved your number). On the business phone, open a few customer chats first.
 *
 *   npm run sync:whatsapp-contacts
 *   npm run export:whatsapp-auth -- --gh
 */
import { loadEnvFile } from "./lib/load-env.js";
import { syncWhatsAppStatusViewers } from "./lib/whatsapp.js";

loadEnvFile();

async function main() {
  const count = await syncWhatsAppStatusViewers();
  console.log(`Saved ${count} status viewers to whatsapp-auth/status-viewers.json`);
  console.log("(Phone contacts + customers who have messaged your business number)\n");
  console.log("\nRe-export for GitHub Actions:");
  console.log("  npm run export:whatsapp-auth -- --gh");
}

main().catch((error) => {
  console.error("\nSync failed:", error.message);
  process.exit(1);
});
