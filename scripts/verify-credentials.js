#!/usr/bin/env node
import { config, platformConfigured, SUPPORTED_PLATFORMS } from "./lib/config.js";
import { verifyYoutubeCredentials } from "./lib/youtube.js";

async function main() {
  console.log("Credential check\n");

  for (const name of SUPPORTED_PLATFORMS) {
    console.log(`${platformConfigured(name) ? "OK" : "MISSING"}  ${name}`);
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
