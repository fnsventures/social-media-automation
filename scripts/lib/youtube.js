import fs from "node:fs";
import path from "node:path";
import { google } from "googleapis";
import { config } from "./config.js";

function createYoutubeClient() {
  const oauth2 = new google.auth.OAuth2(
    config.youtube.clientId,
    config.youtube.clientSecret
  );
  oauth2.setCredentials({ refresh_token: config.youtube.refreshToken });
  return google.youtube({ version: "v3", auth: oauth2 });
}

export async function publishToYoutube(post) {
  if (!post.videoPath) {
    throw new Error("YouTube requires a video file in media.video.");
  }

  const youtube = createYoutubeClient();
  const fileSize = fs.statSync(post.videoPath).size;
  const mimeType = guessVideoMime(post.videoPath);

  const response = await youtube.videos.insert(
    {
      part: ["snippet", "status"],
      requestBody: {
        snippet: {
          title: post.title,
          description: post.caption,
          categoryId: "2",
          tags: post.hashtags?.map((t) => t.replace(/^#/, "")) ?? [],
        },
        status: {
          privacyStatus: "public",
          selfDeclaredMadeForKids: false,
        },
      },
      media: {
        body: fs.createReadStream(post.videoPath),
        mimeType,
      },
    },
    { maxBodyLength: Infinity, maxContentLength: Infinity }
  );

  const videoId = response.data.id;
  return {
    platform: "youtube",
    id: videoId,
    url: `https://www.youtube.com/watch?v=${videoId}`,
    bytes: fileSize,
  };
}

function guessVideoMime(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".mov") return "video/quicktime";
  if (ext === ".webm") return "video/webm";
  return "video/mp4";
}

export async function verifyYoutubeCredentials() {
  const youtube = createYoutubeClient();
  const channels = await youtube.channels.list({ part: ["snippet"], mine: true });
  return channels.data.items?.[0]?.snippet?.title ?? "unknown";
}
