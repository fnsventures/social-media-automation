#!/usr/bin/env node
import { config, platformConfigured } from "./lib/config.js";
import {
  loadPendingPosts,
  markPostPublished,
  saveGeneratedPost,
} from "./lib/content.js";
import { publishToFacebook, publishToInstagram } from "./lib/meta.js";
import { publishToTwitter } from "./lib/twitter.js";
import { publishToYoutube } from "./lib/youtube.js";

const PLATFORM_HANDLERS = {
  facebook: publishToFacebook,
  instagram: publishToInstagram,
  twitter: publishToTwitter,
  youtube: publishToYoutube,
};

function parseArgs(argv) {
  const args = { postId: "", dryRun: config.dryRun };
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === "--post" && argv[i + 1]) {
      args.postId = argv[++i];
    }
    if (argv[i] === "--dry-run") {
      args.dryRun = true;
    }
  }
  return args;
}

async function publishPost(post, dryRun) {
  console.log(`\nPublishing post: ${post.id}`);
  console.log(`Platforms: ${post.platforms.join(", ")}`);
  console.log(`Caption preview:\n${post.caption.slice(0, 200)}...\n`);

  const results = [];

  for (const platform of post.platforms) {
    if (!PLATFORM_HANDLERS[platform]) {
      results.push({ platform, ok: false, error: "Unknown platform" });
      continue;
    }

    if (!platformConfigured(platform)) {
      results.push({
        platform,
        ok: false,
        error: "Platform credentials not configured (missing GitHub Secret)",
      });
      console.warn(`Skipping ${platform}: credentials not configured.`);
      continue;
    }

    if (dryRun) {
      console.log(`[DRY RUN] Would publish to ${platform}`);
      results.push({ platform, ok: true, dryRun: true });
      continue;
    }

    try {
      const result = await PLATFORM_HANDLERS[platform](post);
      results.push({ platform, ok: true, ...result });
      console.log(`Published to ${platform}:`, result.id ?? result.url ?? "ok");
    } catch (error) {
      results.push({ platform, ok: false, error: error.message });
      console.error(`Failed on ${platform}:`, error.message);
    }
  }

  return results;
}

async function main() {
  const args = parseArgs(process.argv);
  const posts = loadPendingPosts({ onlyId: args.postId || undefined });

  if (posts.length === 0) {
    console.log("No pending posts ready to publish.");
    console.log(
      "Tip: copy content/posts/example.yaml, set status: pending, add media, and commit."
    );
    process.exit(0);
  }

  console.log(`Found ${posts.length} pending post(s).`);
  if (args.dryRun) console.log("DRY RUN mode — nothing will be posted.");

  let hadFailure = false;

  for (const post of posts) {
    const results = await publishPost(post, args.dryRun);
    const successCount = results.filter((r) => r.ok).length;

    if (!args.dryRun && successCount > 0) {
      markPostPublished(post.filePath, results);
      console.log(`Marked ${post.id} as published.`);
    }

    if (results.some((r) => !r.ok)) hadFailure = true;
  }

  process.exit(hadFailure ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

export { publishPost, saveGeneratedPost };
