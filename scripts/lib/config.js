import fs from "node:fs";
import path from "node:path";
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

export const config = {
  dryRun: isTruthy(readEnv("DRY_RUN")),
  contentDir: path.resolve(ROOT, readEnv("CONTENT_DIR", "content/posts")),
  timezone: readEnv("TIMEZONE", "Asia/Kolkata"),
  meta: {
    pageAccessToken: readEnv("META_PAGE_ACCESS_TOKEN"),
    pageId: readEnv("META_PAGE_ID"),
    instagramAccountId: readEnv("INSTAGRAM_BUSINESS_ACCOUNT_ID"),
  },
  twitter: {
    appKey: readEnv("TWITTER_API_KEY"),
    appSecret: readEnv("TWITTER_API_SECRET"),
    accessToken: readEnv("TWITTER_ACCESS_TOKEN"),
    accessSecret: readEnv("TWITTER_ACCESS_TOKEN_SECRET"),
  },
  youtube: {
    clientId: readEnv("YOUTUBE_CLIENT_ID"),
    clientSecret: readEnv("YOUTUBE_CLIENT_SECRET"),
    refreshToken: readEnv("YOUTUBE_REFRESH_TOKEN"),
  },
  openai: {
    apiKey: readEnv("OPENAI_API_KEY"),
    model: readEnv("OPENAI_MODEL", "gpt-4o-mini"),
    imageModel: readEnv("OPENAI_IMAGE_MODEL", "dall-e-3"),
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
    case "twitter":
    case "x":
      return Boolean(
        config.twitter.appKey &&
          config.twitter.appSecret &&
          config.twitter.accessToken &&
          config.twitter.accessSecret
      );
    case "youtube":
      return Boolean(
        config.youtube.clientId &&
          config.youtube.clientSecret &&
          config.youtube.refreshToken
      );
    default:
      return false;
  }
}
