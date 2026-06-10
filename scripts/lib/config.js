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

export const SUPPORTED_PLATFORMS = ["facebook", "instagram", "youtube"];

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
        config.youtube.clientId &&
          config.youtube.clientSecret &&
          config.youtube.refreshToken
      );
    default:
      return false;
  }
}
