#!/usr/bin/env node
import { config, platformConfigured, SUPPORTED_PLATFORMS } from "./lib/config.js";
import { extractWhatsAppAuthDir } from "./lib/whatsapp-auth-archive.js";
import { loadStatusViewers } from "./lib/whatsapp-contacts.js";
import { whatsappAuthArchiveValid } from "./lib/whatsapp-auth-archive.js";
import { verifyGoogleBusinessCredentials } from "./lib/google-business.js";
import { verifyMetaCredentials } from "./lib/meta.js";
import { verifyWhatsAppCredentials } from "./lib/whatsapp.js";
import { verifyYoutubeCredentials } from "./lib/youtube.js";
import { youtubeCommunityConfigured } from "./lib/youtube-community.js";

function printStatus(label, state) {
  console.log(`${state.padEnd(7)} ${label}`);
}

async function main() {
  console.log("Credential check\n");

  const results = Object.fromEntries(
    SUPPORTED_PLATFORMS.map((name) => [
      name,
      platformConfigured(name) ? "configured" : "missing",
    ])
  );

  if (platformConfigured("youtube")) {
    try {
      const channel = await verifyYoutubeCredentials();
      results.youtube = "ok";
      console.log(`YouTube connected as "${channel}"`);
      if (youtubeCommunityConfigured()) {
        console.log("YouTube Community image posts are configured.");
      }
    } catch (error) {
      results.youtube = "fail";
      console.error("YouTube verification failed:", error.message);
    }
  }

  if (platformConfigured("facebook")) {
    try {
      const { pageName, instagram } = await verifyMetaCredentials();
      results.facebook = "ok";
      console.log(`Facebook connected to "${pageName}"`);
      if (platformConfigured("instagram")) {
        results.instagram = instagram ? "ok" : "fail";
        if (instagram) {
          console.log(`Instagram connected as @${instagram}`);
        } else {
          console.error(
            "Instagram verification failed: no username returned. Run npm run setup:meta."
          );
        }
      }
    } catch (error) {
      results.facebook = "fail";
      if (platformConfigured("instagram")) results.instagram = "fail";
      console.error("Meta verification failed:", error.message);
    }
  }

  if (platformConfigured("whatsapp")) {
    try {
      const phone = await verifyWhatsAppCredentials();
      results.whatsapp = "ok";
      const viewers =
        config.whatsapp.statusAudience === "all_contacts"
          ? loadStatusViewers(extractWhatsAppAuthDir()).length
          : config.whatsapp.statusContacts.length;
      console.log(
        `WhatsApp connected as ${phone} (status → ${config.whatsapp.statusAudience}, ${viewers} viewers)`
      );
    } catch (error) {
      results.whatsapp = "fail";
      console.error("WhatsApp verification failed:", error.message);
    }
  } else if (process.env.WHATSAPP_AUTH_B64 && !whatsappAuthArchiveValid()) {
    results.whatsapp = "fail";
    console.error(
      "WhatsApp verification failed: WHATSAPP_AUTH_B64 is set but invalid. Run npm run export:whatsapp-auth on the setup laptop and update the GitHub secret."
    );
  }

  if (platformConfigured("google_business")) {
    try {
      const location = await verifyGoogleBusinessCredentials();
      results.google_business = "ok";
      console.log(`Google Business connected to "${location}"`);
      if (config.googleBusiness.mediaBaseUrl) {
        console.log(`Google Business media base: ${config.googleBusiness.mediaBaseUrl}`);
      } else {
        console.warn(
          "Google Business media base URL is not set (GOOGLE_BUSINESS_MEDIA_BASE_URL)."
        );
      }
    } catch (error) {
      results.google_business = "fail";
      console.error("Google Business verification failed:", error.message);
    }
  }

  console.log("");
  for (const name of SUPPORTED_PLATFORMS) {
    const state = results[name];
    if (state === "missing") printStatus(name, "MISSING");
    else if (state === "ok") printStatus(name, "OK");
    else if (state === "fail") printStatus(name, "FAIL");
    else printStatus(name, "OK");
  }

  const failed = SUPPORTED_PLATFORMS.some((name) => results[name] === "fail");
  if (failed) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
