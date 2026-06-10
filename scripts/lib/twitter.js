import fs from "node:fs";
import { TwitterApi } from "twitter-api-v2";
import { config } from "./config.js";

function createClient() {
  return new TwitterApi({
    appKey: config.twitter.appKey,
    appSecret: config.twitter.appSecret,
    accessToken: config.twitter.accessToken,
    accessSecret: config.twitter.accessTokenSecret,
  }).readWrite;
}

function formatTwitterError(error) {
  const detail = error?.data?.detail ?? error?.data?.title;
  if (detail) return `${error.message} — ${detail}`;
  return error.message;
}

export async function publishToTwitter(post) {
  try {
    const client = createClient();
    const text = truncateTweet(post.caption);

    if (post.videoPath) {
      const mediaId = await client.v1.uploadMedia(post.videoPath, {
        mimeType: "video/mp4",
      });
      const tweet = await client.v2.tweet({ text, media: { media_ids: [mediaId] } });
      return {
        platform: "twitter",
        id: tweet.data.id,
        url: `https://x.com/i/web/status/${tweet.data.id}`,
      };
    }

    if (post.imagePath) {
      const mediaId = await client.v1.uploadMedia(post.imagePath);
      const tweet = await client.v2.tweet({ text, media: { media_ids: [mediaId] } });
      return {
        platform: "twitter",
        id: tweet.data.id,
        url: `https://x.com/i/web/status/${tweet.data.id}`,
      };
    }

    const tweet = await client.v2.tweet(text);
    return {
      platform: "twitter",
      id: tweet.data.id,
      url: `https://x.com/i/web/status/${tweet.data.id}`,
    };
  } catch (error) {
    throw new Error(formatTwitterError(error));
  }
}

function truncateTweet(text, max = 280) {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

export async function verifyTwitterCredentials() {
  const client = createClient();
  const me = await client.v2.me();
  return me.data.username;
}
