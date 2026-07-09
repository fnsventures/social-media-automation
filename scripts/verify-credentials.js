#!/usr/bin/env node
/**
 * Check all platform credentials (Facebook, Instagram, YouTube, WhatsApp, Google Business).
 *
 * Usage:
 *   npm run verify              # check only; print fix steps if something fails
 *   npm run verify:fix          # offer to run setup scripts for failed platforms
 *   npm run verify -- --fix     # same as verify:fix
 *
 * Token renewal commands:
 *   npm run setup:meta
 *   npm run setup:youtube
 *   npm run setup:youtube-cookies   (YouTube Community image posts)
 *   npm run setup:whatsapp
 *   npm run setup:google-business
 *   npm run setup:google-business-social
 *
 * Docs: docs/MEDIA_UPLOAD_GUIDE.md#credential-renewal-overview
 */
import { config, platformConfigured, SUPPORTED_PLATFORMS } from "./lib/config.js";
import { extractWhatsAppAuthDir } from "./lib/whatsapp-auth-archive.js";
import { loadStatusViewers } from "./lib/whatsapp-contacts.js";
import { whatsappAuthArchiveValid } from "./lib/whatsapp-auth-archive.js";
import {
  verifyGoogleBusinessCredentials,
  getLocationSocialLinks,
  SOCIAL_URL_ATTRIBUTES,
} from "./lib/google-business.js";
import {
  offerPlatformFix,
  printRecoverySummary,
  PLATFORM_RECOVERY,
} from "./lib/credential-recovery.js";
import { askYesNo, parseSetupArgs } from "./lib/setup-ui.js";
import { verifyMetaCredentials } from "./lib/meta.js";
import { verifyWhatsAppCredentials } from "./lib/whatsapp.js";
import { verifyYoutubeCredentials } from "./lib/youtube.js";
import { youtubeCommunityConfigured } from "./lib/youtube-community.js";

const ARGS = parseSetupArgs();

function printStatus(label, state) {
  console.log(`${state.padEnd(7)} ${label}`);
}

function uniqueFailedPlatforms(failed) {
  const seen = new Set();
  return failed.filter((platform) => {
    const recovery = PLATFORM_RECOVERY[platform];
    const id = recovery?.id ?? platform;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

async function main() {
  console.log("Credential check\n");

  const results = Object.fromEntries(
    SUPPORTED_PLATFORMS.map((name) => [
      name,
      platformConfigured(name) ? "configured" : "missing",
    ])
  );
  const errors = {};
  const failed = [];

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
      errors.youtube = error;
      failed.push("youtube");
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
          errors.instagram = new Error("No Instagram username returned");
          if (!failed.includes("instagram")) failed.push("instagram");
          console.error(
            "Instagram verification failed: no username returned. Run npm run setup:meta."
          );
        }
      }
    } catch (error) {
      results.facebook = "fail";
      errors.facebook = error;
      failed.push("facebook");
      if (platformConfigured("instagram")) {
        results.instagram = "fail";
        errors.instagram = error;
        if (!failed.includes("instagram")) failed.push("instagram");
      }
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
      errors.whatsapp = error;
      failed.push("whatsapp");
      console.error("WhatsApp verification failed:", error.message);
    }
  } else if (process.env.WHATSAPP_AUTH_B64 && !whatsappAuthArchiveValid()) {
    results.whatsapp = "fail";
    errors.whatsapp = new Error("WHATSAPP_AUTH_B64 is set but invalid");
    failed.push("whatsapp");
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
      try {
        const social = await getLocationSocialLinks();
        const labels = {
          [SOCIAL_URL_ATTRIBUTES.facebook]: "Facebook",
          [SOCIAL_URL_ATTRIBUTES.instagram]: "Instagram",
          [SOCIAL_URL_ATTRIBUTES.youtube]: "YouTube",
          [SOCIAL_URL_ATTRIBUTES.linkedin]: "LinkedIn",
          [SOCIAL_URL_ATTRIBUTES.twitter]: "X",
          [SOCIAL_URL_ATTRIBUTES.pinterest]: "Pinterest",
        };
        const linked = Object.entries(social).map(([key, uri]) => `${labels[key] ?? key}: ${uri}`);
        if (linked.length) {
          console.log("Google Business social links:");
          for (const line of linked) console.log(`  ${line}`);
        } else {
          console.warn(
            "Google Business social links: none set. Run npm run setup:google-business-social"
          );
        }
      } catch (socialError) {
        console.warn("Google Business social links: could not read —", socialError.message);
      }
    } catch (error) {
      results.google_business = "fail";
      errors.google_business = error;
      failed.push("google_business");
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

  if (failed.length === 0) return;

  const uniqueFailed = uniqueFailedPlatforms(failed);
  printRecoverySummary(failed, errors);

  if (ARGS.fix) {
    for (const platform of uniqueFailed) {
      const recovery = PLATFORM_RECOVERY[platform];
      const recoveryId = recovery?.id ?? platform;
      await offerPlatformFix(recoveryId, { fix: true, askYesNo });
    }
    console.log("Re-run npm run verify to confirm all credentials.\n");
  } else {
    console.log("To offer automatic renewal scripts, run:\n");
    console.log("  npm run verify:fix\n");
  }

  process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
