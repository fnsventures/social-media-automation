import fs from "node:fs";
import { config } from "./config.js";

const GRAPH = "https://graph.facebook.com/v21.0";

async function graphPost(endpoint, body) {
  const response = await fetch(`${GRAPH}${endpoint}`, {
    method: "POST",
    body,
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(
      `Facebook API error: ${data.error?.message ?? response.statusText}`
    );
  }
  return data;
}

export async function publishToFacebook(post) {
  const { pageAccessToken, pageId } = config.meta;

  if (post.videoPath) {
    const form = new FormData();
    form.append("access_token", pageAccessToken);
    form.append("description", post.caption);
    form.append("source", new Blob([fs.readFileSync(post.videoPath)]), "video.mp4");
    const data = await graphPost(`/${pageId}/videos`, form);
    return { platform: "facebook", id: data.id, url: `https://facebook.com/${data.id}` };
  }

  if (post.imagePath) {
    const form = new FormData();
    form.append("access_token", pageAccessToken);
    form.append("caption", post.caption);
    form.append("source", new Blob([fs.readFileSync(post.imagePath)]), "photo.jpg");
    const data = await graphPost(`/${pageId}/photos`, form);
    return { platform: "facebook", id: data.id ?? data.post_id };
  }

  const form = new FormData();
  form.append("access_token", pageAccessToken);
  form.append("message", post.caption);
  const data = await graphPost(`/${pageId}/feed`, form);
  return { platform: "facebook", id: data.id, url: `https://facebook.com/${data.id}` };
}

export async function publishToInstagram(post) {
  const { pageAccessToken, instagramAccountId } = config.meta;

  if (!post.imagePath && !post.videoPath) {
    throw new Error("Instagram requires an image or video file.");
  }

  const params = new URLSearchParams();
  params.set("access_token", pageAccessToken);
  params.set("caption", post.caption);

  if (post.videoPath) {
    params.set("media_type", "REELS");
    params.set(
      "video_url",
      await uploadMediaForInstagramUrl(post.videoPath, pageAccessToken)
    );
  } else {
    params.set(
      "image_url",
      await uploadMediaForInstagramUrl(post.imagePath, pageAccessToken)
    );
  }

  const container = await fetch(`${GRAPH}/${instagramAccountId}/media`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  }).then((r) => r.json());

  if (container.error) {
    throw new Error(`Instagram container error: ${container.error.message}`);
  }

  await waitForInstagramContainer(container.id, pageAccessToken);

  const publishParams = new URLSearchParams();
  publishParams.set("access_token", pageAccessToken);
  publishParams.set("creation_id", container.id);

  const published = await fetch(`${GRAPH}/${instagramAccountId}/media_publish`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: publishParams,
  }).then((r) => r.json());

  if (published.error) {
    throw new Error(`Instagram publish error: ${published.error.message}`);
  }

  return { platform: "instagram", id: published.id };
}

async function uploadMediaForInstagramUrl(filePath, accessToken) {
  // Instagram Graph API needs a public URL. Upload unpublished media to the Page first.
  const isVideo = /\.(mp4|mov|webm)$/i.test(filePath);
  const form = new FormData();
  form.append("access_token", accessToken);
  form.append("published", "false");
  form.append("source", new Blob([fs.readFileSync(filePath)]), pathBasename(filePath));

  if (isVideo) {
    const data = await graphPost(`/${config.meta.pageId}/videos`, form);
    const video = await fetch(
      `${GRAPH}/${data.id}?fields=source&access_token=${accessToken}`
    ).then((r) => r.json());
    if (!video.source) {
      throw new Error("Could not obtain public video URL for Instagram upload.");
    }
    return video.source;
  }

  form.append("temporary", "true");
  const data = await graphPost(`/${config.meta.pageId}/photos`, form);
  const photo = await fetch(
    `${GRAPH}/${data.id}?fields=images&access_token=${accessToken}`
  ).then((r) => r.json());

  const url = photo.images?.[0]?.source;
  if (!url) {
    throw new Error("Could not obtain public URL for Instagram media upload.");
  }
  return url;
}

function pathBasename(filePath) {
  return filePath.split(/[/\\]/).pop();
}

export async function verifyMetaCredentials() {
  const { pageAccessToken, pageId, instagramAccountId } = config.meta;

  const page = await fetch(
    `${GRAPH}/${pageId}?fields=name&access_token=${encodeURIComponent(pageAccessToken)}`
  ).then((r) => r.json());

  if (page.error) {
    throw new Error(
      `Facebook Page token invalid: ${page.error.message}. Run npm run setup:meta.`
    );
  }

  let instagram = null;
  if (instagramAccountId) {
    const account = await fetch(
      `${GRAPH}/${instagramAccountId}?fields=username&access_token=${encodeURIComponent(pageAccessToken)}`
    ).then((r) => r.json());

    if (account.error) {
      throw new Error(
        `Instagram token invalid: ${account.error.message}. Run npm run setup:meta.`
      );
    }
    instagram = account.username;
  }

  return { pageName: page.name, instagram };
}

async function waitForInstagramContainer(containerId, accessToken, attempts = 20) {
  for (let i = 0; i < attempts; i += 1) {
    const status = await fetch(
      `${GRAPH}/${containerId}?fields=status_code&access_token=${accessToken}`
    ).then((r) => r.json());

    if (status.status_code === "FINISHED") return;
    if (status.status_code === "ERROR") {
      throw new Error("Instagram media processing failed.");
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  throw new Error("Instagram media processing timed out.");
}
