import fs from "node:fs";
import puppeteer from "puppeteer";
import { config } from "./config.js";

function parseCookies() {
  const raw = config.youtube.cookiesJson;
  if (!raw) {
    throw new Error(
      "YouTube Community image posts need YOUTUBE_COOKIES_JSON. Run npm run setup:youtube-cookies."
    );
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new Error("YOUTUBE_COOKIES_JSON must be a non-empty JSON array.");
    }
    return parsed;
  } catch (error) {
    throw new Error(`Invalid YOUTUBE_COOKIES_JSON: ${error.message}`);
  }
}

function communityCaption(post) {
  const parts = [post.caption?.trim(), post.title?.trim()].filter(Boolean);
  return parts.join("\n\n").slice(0, 5000);
}

export async function publishImageCommunityPost(post) {
  const channelId = config.youtube.channelId;
  if (!channelId) {
    throw new Error(
      "YouTube Community image posts need YOUTUBE_CHANNEL_ID (starts with UC...)."
    );
  }

  const cookies = parseCookies();
  const caption = communityCaption(post);
  if (!caption) {
    throw new Error("YouTube Community posts need a caption or title.");
  }

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.setCookie(...cookies);

    const communityUrl = `https://www.youtube.com/channel/${channelId}/community?show_create_dialog=1`;
    await page.goto(communityUrl, { waitUntil: "networkidle2", timeout: 120_000 });

    await page.waitForSelector("#image-button", { timeout: 60_000 });
    await page.click("#image-button");

    await page.waitForSelector("#dropzone > input[type=file]", { timeout: 60_000 });
    const uploadHandle = await page.$("#dropzone > input[type=file]");
    await uploadHandle.uploadFile(post.imagePath);

    await page.waitForSelector("div#contenteditable-root", { timeout: 60_000 });
    const textBox = await page.$("div#contenteditable-root");
    await textBox.click({ clickCount: 3 });
    await textBox.type(caption, { delay: 20 });

    await page.waitForSelector("#submit-button", { timeout: 60_000 });
    await page.click("#submit-button");

    await page.waitForSelector("#share-url", { timeout: 120_000 });
    const postUrl = await page.$eval("#share-url", (el) => el.textContent?.trim() ?? "");

    await page.waitForSelector("#close-button", { timeout: 30_000 }).catch(() => null);
    const closeButton = await page.$("#close-button");
    if (closeButton) await closeButton.click();

    if (!postUrl) {
      throw new Error("YouTube Community post was submitted but no share URL was returned.");
    }

    const postId = postUrl.split("/post/")[1]?.split(/[?#]/)[0] ?? postUrl;

    return {
      platform: "youtube",
      id: postId,
      url: postUrl,
      type: "community_image",
    };
  } finally {
    await browser.close();
  }
}

export function youtubeCommunityConfigured() {
  return Boolean(config.youtube.channelId && config.youtube.cookiesJson);
}

export function verifyYoutubeCommunitySetup() {
  parseCookies();
  if (!config.youtube.channelId) {
    throw new Error("YOUTUBE_CHANNEL_ID is missing.");
  }
  return config.youtube.channelId;
}
