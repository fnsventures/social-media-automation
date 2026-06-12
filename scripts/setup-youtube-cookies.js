#!/usr/bin/env node
/**
 * One-time setup for YouTube Community image posts.
 *
 * YouTube's official API only supports video uploads. Image posts go to the
 * Community tab and need browser session cookies.
 *
 * Steps:
 * 1. Install the "Cookie-Editor" extension in Chrome or Firefox
 * 2. Sign in to YouTube with the channel that should post Community updates
 * 3. Open https://www.youtube.com and export cookies as JSON
 * 4. Save the JSON array to youtube-cookies.json in this repo (gitignored)
 * 5. Copy your channel ID from Studio URL: https://studio.youtube.com/channel/UC...
 *
 * Run: npm run setup:youtube-cookies
 */
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { loadEnvFile, upsertEnvValue } from "./lib/load-env.js";
import { ROOT } from "./lib/config.js";

loadEnvFile();

const COOKIES_PATH = path.join(ROOT, "youtube-cookies.json");

function ask(question) {
  const rl = readline.createInterface({ input, output });
  return rl.question(question).finally(() => rl.close());
}

async function main() {
  console.log("YouTube Community image post setup\n");
  console.log("Export cookies while logged into YouTube:");
  console.log("  1. Install Cookie-Editor in your browser");
  console.log("  2. Open https://www.youtube.com");
  console.log("  3. Export cookies as JSON and save to youtube-cookies.json\n");

  if (!fs.existsSync(COOKIES_PATH)) {
    const answer = await ask(`Paste exported cookies JSON here (or press Enter after saving ${COOKIES_PATH}): `);
    if (answer.trim()) {
      fs.writeFileSync(COOKIES_PATH, answer.trim());
    }
  }

  if (!fs.existsSync(COOKIES_PATH)) {
    throw new Error(`Create ${COOKIES_PATH} with your exported YouTube cookies first.`);
  }

  const cookies = JSON.parse(fs.readFileSync(COOKIES_PATH, "utf8"));
  if (!Array.isArray(cookies) || cookies.length === 0) {
    throw new Error("youtube-cookies.json must contain a JSON array of cookies.");
  }

  const channelId = (await ask("YouTube channel ID (UC... from Studio URL): ")).trim();
  if (!channelId.startsWith("UC")) {
    throw new Error("Channel ID should start with UC.");
  }

  upsertEnvValue("YOUTUBE_CHANNEL_ID", channelId);
  upsertEnvValue("YOUTUBE_COOKIES_JSON", JSON.stringify(cookies));

  console.log("\nSaved to .env:");
  console.log(`  YOUTUBE_CHANNEL_ID=${channelId}`);
  console.log("  YOUTUBE_COOKIES_JSON=[...]");

  console.log("\nAdd these GitHub Secrets:\n");
  console.log("  YOUTUBE_CHANNEL_ID");
  console.log("  YOUTUBE_COOKIES_JSON  (paste the JSON array from youtube-cookies.json)\n");
  console.log("Keep video uploads working with your existing OAuth secrets:");
  console.log("  YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN\n");
}

main().catch((error) => {
  console.error("\nSetup failed:", error.message);
  process.exit(1);
});
