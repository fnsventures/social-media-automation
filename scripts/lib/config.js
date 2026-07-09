import fs from "node:fs";
import path from "node:path";
import { whatsappAuthArchiveValid } from "./whatsapp-auth-archive.js";
import { fileURLToPath } from "node:url";
import { loadEnvFile } from "./load-env.js";

loadEnvFile();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, "../..");

function readEnv(name, fallback = "") {
  return (process.env[name] ?? fallback).trim();
}

function isTruthy(value) {
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

export const SUPPORTED_PLATFORMS = [
  "facebook",
  "instagram",
  "youtube",
  "whatsapp",
  "google_business",
];

function deriveGoogleBusinessMediaBaseUrl() {
  const explicit = readEnv("GOOGLE_BUSINESS_MEDIA_BASE_URL");
  if (explicit) return explicit;

  const repo = readEnv("GITHUB_REPOSITORY");
  if (!repo) return "";

  const branch =
    readEnv("GITHUB_REF_NAME") || readEnv("GITHUB_HEAD_REF") || "studio";
  return `https://raw.githubusercontent.com/${repo}/${branch}`;
}

export const config = {
  dryRun: isTruthy(readEnv("DRY_RUN")),
  contentDir: path.resolve(ROOT, readEnv("CONTENT_DIR", "content/posts")),
  meta: {
    pageAccessToken: readEnv("META_PAGE_ACCESS_TOKEN"),
    pageId: readEnv("META_PAGE_ID"),
    instagramAccountId: readEnv("INSTAGRAM_BUSINESS_ACCOUNT_ID"),
  },
  youtube: {
    clientId: readEnv("YOUTUBE_CLIENT_ID"),
    clientSecret: readEnv("YOUTUBE_CLIENT_SECRET"),
    refreshToken: readEnv("YOUTUBE_REFRESH_TOKEN"),
    channelId: readEnv("YOUTUBE_CHANNEL_ID"),
    cookiesJson: readEnv("YOUTUBE_COOKIES_JSON"),
  },
  whatsapp: {
    authDir: readEnv("WHATSAPP_AUTH_DIR", "whatsapp-auth"),
    authB64: readEnv("WHATSAPP_AUTH_B64"),
    businessNumber: readEnv("WHATSAPP_BUSINESS_NUMBER"),
    statusAudience: readEnv("WHATSAPP_STATUS_AUDIENCE", "all_contacts"),
    statusContacts: readEnv("WHATSAPP_STATUS_CONTACTS")
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean),
  },
  googleBusiness: {
    clientId: readEnv("GOOGLE_BUSINESS_CLIENT_ID") || readEnv("YOUTUBE_CLIENT_ID"),
    clientSecret:
      readEnv("GOOGLE_BUSINESS_CLIENT_SECRET") || readEnv("YOUTUBE_CLIENT_SECRET"),
    refreshToken: readEnv("GOOGLE_BUSINESS_REFRESH_TOKEN"),
    locationName: readEnv("GOOGLE_BUSINESS_LOCATION_NAME"),
    mediaBaseUrl: deriveGoogleBusinessMediaBaseUrl(),
    languageCode: readEnv("GOOGLE_BUSINESS_LANGUAGE_CODE", "en-IN"),
  },
};

export function resolveMediaPath(relativePath) {
  if (!relativePath) return null;
  const absolute = path.resolve(ROOT, relativePath);
  if (!fs.existsSync(absolute)) {
    throw new Error(`Media file not found: ${relativePath}`);
  }
  return absolute;
}

export function platformConfigured(platform) {
  switch (platform) {
    case "facebook":
      return Boolean(config.meta.pageAccessToken && config.meta.pageId);
    case "instagram":
      return Boolean(
        config.meta.pageAccessToken && config.meta.instagramAccountId
      );
    case "youtube":
      return Boolean(
        (config.youtube.channelId && config.youtube.cookiesJson) ||
          (config.youtube.clientId &&
            config.youtube.clientSecret &&
            config.youtube.refreshToken)
      );
    case "whatsapp": {
      const hasAuth = whatsappAuthArchiveValid();
      const hasBusinessNumber = Boolean(config.whatsapp.businessNumber);
      const hasAudience =
        config.whatsapp.statusAudience === "all_contacts" ||
        config.whatsapp.statusContacts.length > 0;
      return hasAuth && hasBusinessNumber && hasAudience;
    }
    case "google_business":
      return Boolean(
        config.googleBusiness.clientId &&
          config.googleBusiness.clientSecret &&
          config.googleBusiness.refreshToken &&
          config.googleBusiness.locationName
      );
    default:
      return false;
  }
}
