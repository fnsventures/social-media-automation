#!/usr/bin/env node
import { config, platformConfigured } from "./lib/config.js";
import { verifyTwitterCredentials } from "./lib/twitter.js";
import { verifyYoutubeCredentials } from "./lib/youtube.js";

const checks = [
  ["facebook", () => platformConfigured("facebook")],
  ["instagram", () => platformConfigured("instagram")],
  ["twitter", () => platformConfigured("twitter")],
  ["youtube", () => platformConfigured("youtube")],
];

async function main() {
  console.log("Credential check\n");

  for (const [name, configured] of checks) {
    const ok = configured();
    console.log(`${ok ? "OK" : "MISSING"}  ${name}`);
  }

  if (platformConfigured("twitter")) {
    try {
      const user = await verifyTwitterCredentials();
      console.log(`\nTwitter connected as @${user}`);
    } catch (error) {
      console.error("Twitter verification failed:", error.message);
    }
  }

  if (platformConfigured("youtube")) {
    try {
      const channel = await verifyYoutubeCredentials();
      console.log(`YouTube connected as "${channel}"`);
    } catch (error) {
      console.error("YouTube verification failed:", error.message);
    }
  }

  if (platformConfigured("facebook")) {
    console.log(`\nMeta Page ID: ${config.meta.pageId}`);
    if (config.meta.instagramAccountId) {
      console.log(`Instagram Business Account ID: ${config.meta.instagramAccountId}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
