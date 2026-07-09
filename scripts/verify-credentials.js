#!/usr/bin/env node
/**
 * Check all platform credentials (Facebook, Instagram, YouTube, WhatsApp, Google Business).
 *
 * Usage:
 *   npm run verify              # check only; print fix steps if something fails
 *   npm run verify:fix          # offer to run setup scripts for failed platforms
 *   npm run verify -- --json    # machine-readable report (for Social Studio / CI)
 *
 * Docs: docs/CREDENTIAL_RECOVERY.md
 */
import fs from "node:fs";
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
import { buildCredentialReport, PLATFORM_LABELS } from "./lib/credential-report.js";
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

async function collectCredentialCheck() {
  const results = Object.fromEntries(
    SUPPORTED_PLATFORMS.map((name) => [
      name,
      platformConfigured(name) ? "configured" : "missing",
    ])
  );
  const messages = {};
  const errors = {};
  const failed = [];
  const warnings = [];
  const socialLinks = [];

  if (platformConfigured("youtube")) {
    try {
      const channel = await verifyYoutubeCredentials();
      results.youtube = "ok";
      messages.youtube = `Connected as "${channel}"`;
      if (youtubeCommunityConfigured()) {
        warnings.push("YouTube Community image posts are configured.");
      }
    } catch (error) {
      results.youtube = "fail";
      errors.youtube = error;
      failed.push("youtube");
    }
  }

  if (platformConfigured("facebook")) {
    try {
      const { pageName, instagram } = await verifyMetaCredentials();
      results.facebook = "ok";
      messages.facebook = `Connected to "${pageName}"`;
      if (platformConfigured("instagram")) {
        results.instagram = instagram ? "ok" : "fail";
        if (instagram) {
          messages.instagram = `Connected as @${instagram}`;
        } else {
          errors.instagram = new Error("No Instagram username returned");
          if (!failed.includes("instagram")) failed.push("instagram");
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
      messages.whatsapp = `Connected as ${phone} (${viewers} viewers)`;
    } catch (error) {
      results.whatsapp = "fail";
      errors.whatsapp = error;
      failed.push("whatsapp");
    }
  } else if (process.env.WHATSAPP_AUTH_B64 && !whatsappAuthArchiveValid()) {
    results.whatsapp = "fail";
    errors.whatsapp = new Error("WHATSAPP_AUTH_B64 is set but invalid");
    failed.push("whatsapp");
  }

  if (platformConfigured("google_business")) {
    try {
      const location = await verifyGoogleBusinessCredentials();
      results.google_business = "ok";
      messages.google_business = `Connected to "${location}"`;
      if (!config.googleBusiness.mediaBaseUrl) {
        warnings.push("GOOGLE_BUSINESS_MEDIA_BASE_URL is not set.");
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
        for (const [key, uri] of Object.entries(social)) {
          socialLinks.push({ platform: labels[key] ?? key, url: uri });
        }
        if (!socialLinks.length) {
          warnings.push("No Google Business social links set. Run npm run setup:google-business-social");
        }
      } catch (socialError) {
        warnings.push(`Google Business social links: ${socialError.message}`);
      }
    } catch (error) {
      results.google_business = "fail";
      errors.google_business = error;
      failed.push("google_business");
    }
  }

  return { results, messages, errors, failed, warnings, socialLinks };
}

function printHumanReport(check) {
  const { results, messages, errors, failed, warnings, socialLinks } = check;

  console.log("Credential check\n");

  for (const name of SUPPORTED_PLATFORMS) {
    const state = results[name];
    if (state === "ok" && messages[name]) {
      console.log(`${PLATFORM_LABELS[name] ?? name}: ${messages[name]}`);
    } else if (state === "fail") {
      console.error(`${PLATFORM_LABELS[name] ?? name} verification failed:`, messageFromError(errors[name]));
    }
  }

  for (const warning of warnings) {
    console.warn(warning);
  }

  if (socialLinks.length) {
    console.log("Google Business social links:");
    for (const link of socialLinks) {
      console.log(`  ${link.platform}: ${link.url}`);
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
}

function messageFromError(error) {
  if (!error) return "";
  if (typeof error === "string") return error;
  return error.message ?? String(error);
}

async function main() {
  const check = await collectCredentialCheck();
  const report = buildCredentialReport(check);

  if (ARGS.json) {
    const outputPath = process.env.CREDENTIAL_REPORT_PATH || "credential-health.json";
    fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`CREDENTIAL_HEALTH_JSON:${JSON.stringify(report)}`);
    process.exit(report.ok ? 0 : 1);
  }

  printHumanReport(check);

  if (check.failed.length === 0) return;

  printRecoverySummary(check.failed, check.errors);

  if (ARGS.fix) {
    const uniqueFailed = uniqueFailedPlatforms(check.failed);
    for (const platform of uniqueFailed) {
      const recovery = PLATFORM_RECOVERY[platform];
      if (!recovery?.setupCommand) continue;
      const recoveryId = recovery.id ?? platform;
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
