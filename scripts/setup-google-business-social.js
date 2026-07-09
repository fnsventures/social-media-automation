#!/usr/bin/env node
/**
 * Link Facebook, Instagram, and YouTube profiles on Google Business Profile
 * via locations.updateAttributes (works when the dashboard has no Social profiles field).
 *
 * Prerequisites:
 * - npm run setup:google-business (GOOGLE_BUSINESS_* credentials in .env)
 * - Meta credentials for Facebook/Instagram (META_PAGE_ACCESS_TOKEN, META_PAGE_ID, …)
 *
 * Optional overrides in .env:
 * - GOOGLE_BUSINESS_FACEBOOK_URL / GOOGLE_BUSINESS_INSTAGRAM_URL (your outlet pages)
 * - GOOGLE_BUSINESS_YOUTUBE_URL / GOOGLE_BUSINESS_LINKEDIN_URL / GOOGLE_BUSINESS_TWITTER_URL
 * - GOOGLE_BUSINESS_INCLUDE_BPCL_OFFICIAL=true — also set BPCL corporate links on free slots
 *   (LinkedIn, YouTube, X). Facebook and Instagram allow only one link each on GBP, so keep
 *   your outlet pages there for the social media updates carousel.
 *
 * Run: npm run setup:google-business-social
 */
import { loadEnvFile } from "./lib/load-env.js";
import { config } from "./lib/config.js";
import {
  SOCIAL_URL_ATTRIBUTES,
  getLocationSocialLinks,
  updateLocationSocialLinks,
  verifyGoogleBusinessCredentials,
} from "./lib/google-business.js";

loadEnvFile();

const GRAPH = "https://graph.facebook.com/v21.0";

/** Official BPCL corporate profiles (bharatpetroleum.in). */
const BPCL_OFFICIAL = {
  facebook: "https://www.facebook.com/BharatPetroleumCorporation",
  instagram: "https://www.instagram.com/bpclimited",
  linkedin: "https://www.linkedin.com/company/bpcl",
  youtube: "https://www.youtube.com/user/bpclbrand",
  twitter: "https://www.twitter.com/bpclimited",
};

function readEnv(name) {
  return (process.env[name] ?? "").trim();
}

function normalizeFacebookUrl(username, link) {
  if (username) {
    return `https://www.facebook.com/${username.replace(/^\/+/, "")}`;
  }
  if (link) {
    return link.replace(/^http:\/\//, "https://").replace(/\/+$/, "");
  }
  return "";
}

function normalizeInstagramUrl(username) {
  if (!username) return "";
  return `https://www.instagram.com/${username.replace(/^@/, "").replace(/^\/+/, "")}`;
}

function isTruthy(value) {
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

function normalizeYouTubeUrl(value) {
  if (!value) return "";
  const trimmed = value.trim();
  if (trimmed.startsWith("http")) {
    return trimmed.replace(/\/+$/, "");
  }
  if (trimmed.startsWith("@")) {
    return `https://www.youtube.com/${trimmed}`;
  }
  if (trimmed.startsWith("UC")) {
    return `https://www.youtube.com/channel/${trimmed}`;
  }
  return `https://www.youtube.com/@${trimmed.replace(/^@/, "")}`;
}

function normalizeGenericUrl(value) {
  if (!value) return "";
  return value.trim().replace(/^http:\/\//, "https://").replace(/\/+$/, "");
}

async function fetchMetaSocialUrls() {
  const token = config.meta.pageAccessToken;
  const pageId = config.meta.pageId;
  const instagramId = config.meta.instagramAccountId;

  if (!token || !pageId) {
    return { facebook: "", instagram: "" };
  }

  const pageResponse = await fetch(
    `${GRAPH}/${pageId}?fields=username,link&access_token=${encodeURIComponent(token)}`
  );
  const page = await pageResponse.json();
  if (page.error) {
    throw new Error(`Facebook API error: ${page.error.message}`);
  }

  let instagramUsername = "";
  if (instagramId) {
    const igResponse = await fetch(
      `${GRAPH}/${instagramId}?fields=username&access_token=${encodeURIComponent(token)}`
    );
    const ig = await igResponse.json();
    if (ig.error) {
      throw new Error(`Instagram API error: ${ig.error.message}`);
    }
    instagramUsername = ig.username ?? "";
  }

  return {
    facebook: normalizeFacebookUrl(page.username, page.link),
    instagram: normalizeInstagramUrl(instagramUsername),
  };
}

async function resolveSocialUrls() {
  const includeBpcl = isTruthy(readEnv("GOOGLE_BUSINESS_INCLUDE_BPCL_OFFICIAL"));
  const overrides = {
    facebook: readEnv("GOOGLE_BUSINESS_FACEBOOK_URL"),
    instagram: readEnv("GOOGLE_BUSINESS_INSTAGRAM_URL"),
    youtube: readEnv("GOOGLE_BUSINESS_YOUTUBE_URL"),
    linkedin: readEnv("GOOGLE_BUSINESS_LINKEDIN_URL"),
    twitter: readEnv("GOOGLE_BUSINESS_TWITTER_URL"),
    pinterest: readEnv("GOOGLE_BUSINESS_PINTEREST_URL"),
  };

  const fromMeta = await fetchMetaSocialUrls();
  const youtubeFromEnv =
    overrides.youtube ||
    (includeBpcl ? BPCL_OFFICIAL.youtube : "") ||
    normalizeYouTubeUrl(config.youtube.channelId) ||
    normalizeYouTubeUrl(readEnv("YOUTUBE_CHANNEL_HANDLE"));

  return {
    facebook: overrides.facebook || fromMeta.facebook,
    instagram: overrides.instagram || fromMeta.instagram,
    youtube: youtubeFromEnv,
    linkedin: overrides.linkedin || (includeBpcl ? BPCL_OFFICIAL.linkedin : ""),
    twitter: overrides.twitter || (includeBpcl ? BPCL_OFFICIAL.twitter : ""),
    pinterest: overrides.pinterest,
  };
}

function formatAttributeLabel(attributeName) {
  return attributeName.replace("attributes/url_", "").replace(/_/g, " ");
}

async function main() {
  const locationTitle = await verifyGoogleBusinessCredentials();
  console.log(`Google Business connected to "${locationTitle}"\n`);

  const urls = await resolveSocialUrls();
  const planned = [];

  if (urls.facebook) {
    planned.push([SOCIAL_URL_ATTRIBUTES.facebook, urls.facebook]);
  }
  if (urls.instagram) {
    planned.push([SOCIAL_URL_ATTRIBUTES.instagram, urls.instagram]);
  }
  if (urls.youtube) {
    planned.push([SOCIAL_URL_ATTRIBUTES.youtube, urls.youtube]);
  }
  if (urls.linkedin) {
    planned.push([SOCIAL_URL_ATTRIBUTES.linkedin, normalizeGenericUrl(urls.linkedin)]);
  }
  if (urls.twitter) {
    planned.push([SOCIAL_URL_ATTRIBUTES.twitter, normalizeGenericUrl(urls.twitter)]);
  }
  if (urls.pinterest) {
    planned.push([SOCIAL_URL_ATTRIBUTES.pinterest, normalizeGenericUrl(urls.pinterest)]);
  }

  if (planned.length === 0) {
    throw new Error(
      "No social URLs found. Set Meta credentials in .env or add overrides:\n" +
        "  GOOGLE_BUSINESS_FACEBOOK_URL\n" +
        "  GOOGLE_BUSINESS_INSTAGRAM_URL\n" +
        "  GOOGLE_BUSINESS_YOUTUBE_URL\n" +
        "  GOOGLE_BUSINESS_LINKEDIN_URL\n" +
        "  GOOGLE_BUSINESS_TWITTER_URL\n" +
        "Or set GOOGLE_BUSINESS_INCLUDE_BPCL_OFFICIAL=true for BPCL corporate links."
    );
  }

  const includeBpcl = isTruthy(readEnv("GOOGLE_BUSINESS_INCLUDE_BPCL_OFFICIAL"));
  if (includeBpcl) {
    console.log(
      "Note: GBP allows one Facebook and one Instagram link only.\n" +
        "Keeping your outlet on those slots; BPCL official links go on LinkedIn / YouTube / X.\n" +
        `BPCL Facebook (reference): ${BPCL_OFFICIAL.facebook}\n` +
        `BPCL Instagram (reference): ${BPCL_OFFICIAL.instagram}\n`
    );
  }

  console.log("Will set these social profile links:\n");
  for (const [attributeName, uri] of planned) {
    console.log(`  ${formatAttributeLabel(attributeName)}: ${uri}`);
  }
  console.log("");

  const payload = Object.fromEntries(planned);
  await updateLocationSocialLinks(payload);

  const saved = await getLocationSocialLinks();
  console.log("Saved on Google Business Profile:\n");
  for (const [attributeName, uri] of planned) {
    const current = saved[attributeName];
    const status = current === uri ? "ok" : current ? "changed" : "missing";
    console.log(`  [${status}] ${formatAttributeLabel(attributeName)}: ${current ?? "(not set)"}`);
  }

  console.log(
    "\nSocial media updates may take 24–72 hours to appear on your public listing."
  );
}

main().catch((error) => {
  console.error("\nSetup failed:", error.message);
  process.exit(1);
});
