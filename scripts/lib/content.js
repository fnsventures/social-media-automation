import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import { config, resolveMediaPath, SUPPORTED_PLATFORMS } from "./config.js";

const SUPPORTED_PLATFORM_SET = new Set(SUPPORTED_PLATFORMS);

function listPostFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".yaml") && !name.endsWith(".published.yaml"))
    .map((name) => path.join(dir, name));
}

function buildCaption(post) {
  const tags = (post.hashtags ?? [])
    .map((tag) => (tag.startsWith("#") ? tag : `#${tag}`))
    .join(" ");
  const body = String(post.caption ?? "").trim();
  return tags ? `${body}\n\n${tags}`.trim() : body;
}

function normalizePlatforms(platforms) {
  return (platforms ?? []).filter((platform) => SUPPORTED_PLATFORM_SET.has(platform));
}

export function loadPost(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const post = yaml.load(raw);
  if (!post?.id) {
    throw new Error(`Post ${filePath} is missing required field: id`);
  }

  const imagePath = post.media?.image
    ? resolveMediaPath(post.media.image)
    : null;
  const videoPath = post.media?.video
    ? resolveMediaPath(post.media.video)
    : null;

  return {
    filePath,
    id: post.id,
    status: post.status ?? "draft",
    publishAt: post.publish_at ?? "",
    platforms: normalizePlatforms(post.platforms),
    title: post.title ?? post.id,
    caption: buildCaption(post),
    hashtags: post.hashtags ?? [],
    imagePath,
    videoPath,
  };
}

export function loadPostsByStatus(status) {
  return listPostFiles(config.contentDir)
    .map((filePath) => loadPost(filePath))
    .filter((post) => post.status === status);
}

export function findPostById(postId) {
  for (const filePath of listPostFiles(config.contentDir)) {
    const post = loadPost(filePath);
    if (post.id === postId) return post;
  }
  return null;
}

export function approvePost(postId) {
  for (const filePath of listPostFiles(config.contentDir)) {
    const raw = fs.readFileSync(filePath, "utf8");
    const post = yaml.load(raw);
    if (post.id !== postId) continue;

    if (post.status !== "review") {
      throw new Error(`Post "${postId}" is "${post.status}", expected "review".`);
    }

    post.status = "pending";
    post.approved_at = new Date().toISOString();
    fs.writeFileSync(filePath, yaml.dump(post, { lineWidth: 120 }));
    return filePath;
  }

  throw new Error(`Post not found: ${postId}`);
}

function isDue(post, now = Date.now()) {
  if (!post.publishAt) return true;
  const due = Date.parse(post.publishAt);
  return Number.isFinite(due) && due <= now;
}

export function loadPendingPosts({ onlyId } = {}) {
  return listPostFiles(config.contentDir)
    .map((filePath) => loadPost(filePath))
    .filter((post) => {
      if (onlyId && post.id !== onlyId) return false;
      if (post.status !== "pending") return false;
      return isDue(post);
    });
}

export function loadPostsToPublish({ onlyId, dryRun = false } = {}) {
  if (onlyId) {
    const post = findPostById(onlyId);
    if (!post) return [];
    if (post.status === "pending" && isDue(post)) return [post];
    if (dryRun && post.status === "review") return [post];
    return [];
  }

  const pending = loadPendingPosts();
  if (!dryRun) return pending;
  return [...pending, ...loadPostsByStatus("review")];
}

export function savePostResults(filePath, results) {
  const raw = fs.readFileSync(filePath, "utf8");
  const post = yaml.load(raw);
  post.last_publish_attempt = new Date().toISOString();
  post.results = results;
  fs.writeFileSync(filePath, yaml.dump(post, { lineWidth: 120 }));
}

export function markPostPublished(filePath, results) {
  const raw = fs.readFileSync(filePath, "utf8");
  const post = yaml.load(raw);
  post.status = "published";
  post.published_at = new Date().toISOString();
  post.results = results;

  const publishedPath = filePath.replace(/\.yaml$/, ".published.yaml");
  fs.writeFileSync(publishedPath, yaml.dump(post, { lineWidth: 120 }));
  fs.unlinkSync(filePath);
}
