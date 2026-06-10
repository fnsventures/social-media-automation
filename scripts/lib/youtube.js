import fs from "node:fs";
import path from "node:path";
import { google } from "googleapis";
import { config, ROOT } from "./config.js";
import { createVideoFromImage } from "./ffmpeg-video.js";

function createOAuth2Client() {
  return new google.auth.OAuth2(
    config.youtube.clientId,
    config.youtube.clientSecret
  );
}

function createYoutubeClient() {
  const oauth2 = createOAuth2Client();
  oauth2.setCredentials({ refresh_token: config.youtube.refreshToken });
  return google.youtube({ version: "v3", auth: oauth2 });
}

function guessVideoMime(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".mov") return "video/quicktime";
  if (ext === ".webm") return "video/webm";
  return "video/mp4";
}

function resolveVideoPath(post) {
  if (post.videoPath) return post.videoPath;

  if (!post.imagePath) {
    throw new Error("YouTube requires media.image or media.video.");
  }

  const relativeImage = path.relative(ROOT, post.imagePath);
  const relativeVideo = `media/.generated/${post.id}-youtube.mp4`;
  createVideoFromImage(relativeImage, relativeVideo);
  return path.resolve(ROOT, relativeVideo);
}

export async function publishToYoutube(post) {
  const youtube = createYoutubeClient();
  const videoPath = resolveVideoPath(post);
  const fileSize = fs.statSync(videoPath).size;
  const mimeType = guessVideoMime(videoPath);

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
        body: fs.createReadStream(videoPath),
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

export async function verifyYoutubeCredentials() {
  const oauth2 = createOAuth2Client();
  oauth2.setCredentials({ refresh_token: config.youtube.refreshToken });
  const { token } = await oauth2.getAccessToken();
  if (!token) {
    throw new Error("Could not refresh YouTube access token.");
  }
  return "upload access ready";
}
