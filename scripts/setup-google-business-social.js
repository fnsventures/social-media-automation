#!/usr/bin/env node
/**
 * Link social profiles on Google Business Profile via locations.updateAttributes.
 *
 * Commands:
 *   npm run setup:google-business-social          # interactive link (default)
 *   npm run setup:google-business-social -- --check   # verify only, no changes
 *   npm run setup:google-business-social -- --fix     # offer to re-auth when tokens expire
 *   npm run setup:google-business-social -- --yes     # skip confirmation prompt
 *
 * See docs/GOOGLE_BUSINESS_SOCIAL_LINKS.md for the full guide.
 */
import { loadEnvFile, upsertEnvValue } from "./lib/load-env.js";
import { config } from "./lib/config.js";
import {
  SOCIAL_URL_ATTRIBUTES,
  getLocationSocialLinks,
  removeLocationSocialLinks,
  updateLocationSocialLinks,
  verifyGoogleBusinessCredentials,
} from "./lib/google-business.js";
import {
  offerGoogleBusinessFix,
  offerMetaFix,
  printGoogleBusinessRecovery,
  printMetaRecovery,
  wrapSetupError,
} from "./lib/credential-recovery.js";
import {
  ask,
  askYesNo,
  parseSetupArgs,
  printCopyBlock,
  printHeading,
  printStep,
} from "./lib/setup-ui.js";

loadEnvFile();

const GRAPH = "https://graph.facebook.com/v21.0";
const ARGS = parseSetupArgs();

/** Official BPCL corporate profiles (bharatpetroleum.in). */
const BPCL_OFFICIAL = {
  facebook: "https://www.facebook.com/BharatPetroleumCorporation",
  instagram: "https://www.instagram.com/bpclimited",
  linkedin: "https://www.linkedin.com/company/bpcl",
  youtube: "https://www.youtube.com/user/bpclbrand",
  twitter: "https://www.twitter.com/bpclimited",
};

const HELP_TEXT = `
Google Business — link social profiles

Usage:
  npm run setup:google-business-social [options]

Options:
  --check    Show current links and credentials only (no changes)
  --fix      When a token is expired, offer to run the matching setup script
  --yes, -y  Apply links without asking for confirmation
  --help     Show this help

Prerequisites:
  npm run setup:google-business   (Google OAuth — required)
  npm run setup:meta              (optional — auto-detects Facebook/Instagram URLs)

Docs: docs/GOOGLE_BUSINESS_SOCIAL_LINKS.md
`;

function readEnv(name) {
  return (process.env[name] ?? "").trim();
}

function isTruthy(value) {
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

function normalizeFacebookUrl(username, link) {
  if (username) return `https://www.facebook.com/${username.replace(/^\/+/, "")}`;
  if (link) return link.replace(/^http:\/\//, "https://").replace(/\/+$/, "");
  return "";
}

function normalizeInstagramUrl(username) {
  if (!username) return "";
  return `https://www.instagram.com/${username.replace(/^@/, "").replace(/^\/+/, "")}`;
}

function normalizeYouTubeUrl(value) {
  if (!value) return "";
  const trimmed = value.trim();
  if (trimmed.startsWith("http")) return trimmed.replace(/\/+$/, "");
  if (trimmed.startsWith("@")) return `https://www.youtube.com/${trimmed}`;
  if (trimmed.startsWith("UC")) return `https://www.youtube.com/channel/${trimmed}`;
  return `https://www.youtube.com/@${trimmed.replace(/^@/, "")}`;
}

function normalizeGenericUrl(value) {
  if (!value) return "";
  return value
    .trim()
    .replace(/^http:\/\//, "https://")
    .replace(/^https:\/\/x\.com\//i, "https://www.twitter.com/")
    .replace(/\/+$/, "");
}

function formatAttributeLabel(attributeName) {
  return attributeName.replace("attributes/url_", "").replace(/_/g, " ");
}

function printHelp() {
  console.log(HELP_TEXT.trim());
}

async function fetchMetaSocialUrls() {
  const token = config.meta.pageAccessToken;
  const pageId = config.meta.pageId;
  const instagramId = config.meta.instagramAccountId;

  if (!token || !pageId) {
    return { facebook: "", instagram: "", source: "none" };
  }

  const pageResponse = await fetch(
    `${GRAPH}/${pageId}?fields=username,link,name&access_token=${encodeURIComponent(token)}`
  );
  const page = await pageResponse.json();
  if (page.error) {
    const err = new Error(`Facebook API error: ${page.error.message}`);
    err.metaError = page.error;
    throw err;
  }

  let instagramUsername = "";
  if (instagramId) {
    const igResponse = await fetch(
      `${GRAPH}/${instagramId}?fields=username&access_token=${encodeURIComponent(token)}`
    );
    const ig = await igResponse.json();
    if (ig.error) {
      const err = new Error(`Instagram API error: ${ig.error.message}`);
      err.metaError = ig.error;
      throw err;
    }
    instagramUsername = ig.username ?? "";
  }

  return {
    facebook: normalizeFacebookUrl(page.username, page.link),
    instagram: normalizeInstagramUrl(instagramUsername),
    pageName: page.name,
    source: "meta",
  };
}

async function resolveSocialUrls(manualOverrides = {}) {
  const includeBpcl = isTruthy(readEnv("GOOGLE_BUSINESS_INCLUDE_BPCL_OFFICIAL"));
  const overrides = {
    facebook: manualOverrides.facebook || readEnv("GOOGLE_BUSINESS_FACEBOOK_URL"),
    instagram: manualOverrides.instagram || readEnv("GOOGLE_BUSINESS_INSTAGRAM_URL"),
    youtube: readEnv("GOOGLE_BUSINESS_YOUTUBE_URL"),
    linkedin: readEnv("GOOGLE_BUSINESS_LINKEDIN_URL"),
    twitter: readEnv("GOOGLE_BUSINESS_TWITTER_URL"),
    pinterest: readEnv("GOOGLE_BUSINESS_PINTEREST_URL"),
  };

  let fromMeta = { facebook: "", instagram: "", source: "none" };
  try {
    fromMeta = await fetchMetaSocialUrls();
  } catch (error) {
    const wrapped = wrapSetupError(error);
    if (wrapped.type === "meta") {
      const fixResult = await offerMetaFix({ fix: ARGS.fix, askYesNo, ask });
      if (fixResult === "refreshed") {
        fromMeta = await fetchMetaSocialUrls();
      } else if (fixResult && typeof fixResult === "object") {
        overrides.facebook = overrides.facebook || fixResult.facebook;
        overrides.instagram = overrides.instagram || fixResult.instagram;
      } else {
        throw error;
      }
    } else {
      throw error;
    }
  }

  const youtubeFromEnv =
    overrides.youtube ||
    (includeBpcl ? BPCL_OFFICIAL.youtube : "") ||
    normalizeYouTubeUrl(config.youtube.channelId) ||
    normalizeYouTubeUrl(readEnv("YOUTUBE_CHANNEL_HANDLE"));

  return {
    facebook: overrides.facebook || fromMeta.facebook,
    instagram: overrides.instagram || fromMeta.instagram,
    youtube: youtubeFromEnv,
    linkedin: overrides.linkedin,
    twitter: overrides.twitter,
    pinterest: overrides.pinterest,
    metaPageName: fromMeta.pageName,
    detectedFromMeta: fromMeta.source === "meta",
  };
}

function buildPlannedLinks(urls) {
  const planned = [];
  if (urls.facebook) planned.push([SOCIAL_URL_ATTRIBUTES.facebook, urls.facebook]);
  if (urls.instagram) planned.push([SOCIAL_URL_ATTRIBUTES.instagram, urls.instagram]);
  if (urls.youtube) planned.push([SOCIAL_URL_ATTRIBUTES.youtube, urls.youtube]);
  if (urls.linkedin) {
    planned.push([SOCIAL_URL_ATTRIBUTES.linkedin, normalizeGenericUrl(urls.linkedin)]);
  }
  if (urls.twitter) {
    planned.push([SOCIAL_URL_ATTRIBUTES.twitter, normalizeGenericUrl(urls.twitter)]);
  }
  if (urls.pinterest) {
    planned.push([SOCIAL_URL_ATTRIBUTES.pinterest, normalizeGenericUrl(urls.pinterest)]);
  }
  return planned;
}

function saveDiscoveredUrls(urls) {
  const saved = [];
  if (urls.facebook && !readEnv("GOOGLE_BUSINESS_FACEBOOK_URL")) {
    upsertEnvValue("GOOGLE_BUSINESS_FACEBOOK_URL", urls.facebook);
    saved.push(`GOOGLE_BUSINESS_FACEBOOK_URL=${urls.facebook}`);
  }
  if (urls.instagram && !readEnv("GOOGLE_BUSINESS_INSTAGRAM_URL")) {
    upsertEnvValue("GOOGLE_BUSINESS_INSTAGRAM_URL", urls.instagram);
    saved.push(`GOOGLE_BUSINESS_INSTAGRAM_URL=${urls.instagram}`);
  }
  return saved;
}

async function verifyGoogleAccess() {
  try {
    return await verifyGoogleBusinessCredentials();
  } catch (error) {
    const wrapped = wrapSetupError(error);
    if (wrapped.type === "google_business") {
      const fixed = await offerGoogleBusinessFix({ fix: ARGS.fix, askYesNo });
      if (fixed) return verifyGoogleBusinessCredentials();
      if (!ARGS.fix) {
        printGoogleBusinessRecovery({ apiDisabled: wrapped.apiDisabled });
      }
    }
    throw error;
  }
}

function printCredentialStatus() {
  const checks = [
    ["Google Business OAuth", Boolean(config.googleBusiness.refreshToken)],
    ["Google location", Boolean(config.googleBusiness.locationName)],
    ["Meta Page token (optional)", Boolean(config.meta.pageAccessToken)],
    ["Meta Page ID (optional)", Boolean(config.meta.pageId)],
    ["BPCL official links", isTruthy(readEnv("GOOGLE_BUSINESS_INCLUDE_BPCL_OFFICIAL"))],
  ];
  console.log("Credential checklist:\n");
  for (const [label, ok] of checks) {
    console.log(`  ${ok ? "✓" : "✗"} ${label}`);
  }
  console.log("");
}

async function printCurrentLinks() {
  const saved = await getLocationSocialLinks();
  const keys = Object.values(SOCIAL_URL_ATTRIBUTES);
  console.log("Current links on Google Business Profile:\n");
  let any = false;
  for (const key of keys) {
    if (saved[key]) {
      any = true;
      console.log(`  ${formatAttributeLabel(key)}: ${saved[key]}`);
    }
  }
  if (!any) console.log("  (none set yet)\n");
  else console.log("");
}

async function runCheckMode(locationTitle) {
  printHeading("Check only — no changes made");
  console.log(`  Location: ${locationTitle}\n`);
  printCredentialStatus();
  await printCurrentLinks();
  console.log("To apply or update links, run without --check:\n");
  printCopyBlock("Terminal", ["npm run setup:google-business-social"]);
}

async function main() {
  if (ARGS.help) {
    printHelp();
    return;
  }

  printHeading("Google Business — social profile links");
  console.log(
    "  Links your Facebook, Instagram, and other profiles on Google Business Profile.\n" +
      "  Works even when the dashboard has no Social profiles field.\n"
  );

  if (!config.googleBusiness.refreshToken) {
    printGoogleBusinessRecovery();
    throw new Error("GOOGLE_BUSINESS_REFRESH_TOKEN is missing. Run npm run setup:google-business first.");
  }

  const locationTitle = await verifyGoogleAccess();
  console.log(`  Connected to: ${locationTitle}\n`);

  if (ARGS.checkOnly) {
    await runCheckMode(locationTitle);
    return;
  }

  const urls = await resolveSocialUrls();
  const planned = buildPlannedLinks(urls);

  if (planned.length === 0) {
    printMetaRecovery();
    throw new Error(
      "No social URLs to apply. Run npm run setup:meta or add GOOGLE_BUSINESS_FACEBOOK_URL / GOOGLE_BUSINESS_INSTAGRAM_URL to .env."
    );
  }

  if (isTruthy(readEnv("GOOGLE_BUSINESS_INCLUDE_BPCL_OFFICIAL"))) {
    console.log(
      "  BPCL mode: outlet on Facebook/Instagram; BPCL YouTube only.\n" +
        "  LinkedIn and X are omitted unless set in GOOGLE_BUSINESS_LINKEDIN_URL / GOOGLE_BUSINESS_TWITTER_URL.\n" +
        `  BPCL Facebook (reference only): ${BPCL_OFFICIAL.facebook}\n` +
        `  BPCL Instagram (reference only): ${BPCL_OFFICIAL.instagram}\n`
    );
  }

  if (urls.detectedFromMeta && urls.metaPageName) {
    console.log(`  Detected from Meta: ${urls.metaPageName}\n`);
  }

  console.log("  Will set these links:\n");
  for (const [attributeName, uri] of planned) {
    console.log(`    ${formatAttributeLabel(attributeName)}: ${uri}`);
  }
  console.log("");

  const current = await getLocationSocialLinks();
  const plannedNames = new Set(planned.map(([name]) => name));
  const removals = Object.keys(current).filter((name) => !plannedNames.has(name));
  const changes = planned.filter(([name, uri]) => current[name] !== uri);

  if (changes.length === 0 && removals.length === 0) {
    console.log("  All links already match — nothing to update.\n");
    await printCurrentLinks();
    printStep(1, "Social media updates may take 24–72 hours to appear on your listing.");
    printStep(2, "Keep posting via Social Studio to feed the carousel.");
    return;
  }

  if (removals.length) {
    console.log("  Will remove links no longer in your plan:\n");
    for (const name of removals) {
      console.log(`    ${formatAttributeLabel(name)}: ${current[name]}`);
    }
    console.log("");
  }

  if (!ARGS.yes) {
    const proceed = await askYesNo("Apply these links to your Google Business Profile?");
    if (!proceed) {
      console.log("\n  Cancelled. No changes made.\n");
      return;
    }
  }

  const savedEnvLines = saveDiscoveredUrls(urls);
  if (removals.length) {
    await removeLocationSocialLinks(removals);
  }
  if (planned.length) {
    await updateLocationSocialLinks(Object.fromEntries(planned));
  }

  const saved = await getLocationSocialLinks();
  printHeading("Done — saved on Google Business Profile");
  for (const [attributeName, uri] of planned) {
    const live = saved[attributeName];
    const status = live === uri ? "ok" : live ? "check" : "missing";
    console.log(`  [${status}] ${formatAttributeLabel(attributeName)}: ${live ?? "(not set)"}`);
  }

  console.log(
    "\n  Next steps:\n" +
      "  • Wait 24–72 hours for Social media updates to refresh on Google Search/Maps\n" +
      "  • Post regularly via Social Studio (Facebook + Instagram feed the carousel)\n" +
      "  • Run npm run setup:google-business-social -- --check anytime to verify links\n"
  );

  if (savedEnvLines.length) {
    console.log("  Saved detected URLs to .env:\n");
    for (const line of savedEnvLines) console.log(`    ${line}`);
    console.log("");
  }
}

main().catch((error) => {
  const wrapped = wrapSetupError(error);
  if (wrapped.type === "google_business") {
    if (!ARGS.fix) printGoogleBusinessRecovery({ apiDisabled: wrapped.apiDisabled });
  } else if (wrapped.type === "meta") {
    if (!ARGS.fix) printMetaRecovery();
  } else {
    console.error(`\n${wrapped.message}\n`);
  }
  process.exit(1);
});
