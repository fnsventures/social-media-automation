#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import { parseArgs } from "./lib/cli.js";
import { config, platformConfigured } from "./lib/config.js";
import {
  loadPostsToPublish,
  markPostPublished,
  savePostResults,
} from "./lib/content.js";
import { publishToFacebook, publishToInstagram } from "./lib/meta.js";
import { publishToGoogleBusiness } from "./lib/google-business.js";
import { publishToWhatsApp } from "./lib/whatsapp.js";
import { publishToYoutube } from "./lib/youtube.js";

const PLATFORM_HANDLERS = {
  facebook: publishToFacebook,
  instagram: publishToInstagram,
  youtube: publishToYoutube,
  whatsapp: publishToWhatsApp,
  google_business: publishToGoogleBusiness,
};

// Facebook and Instagram both upload to the same Page /photos endpoint.
// Run them sequentially (Instagram first) to avoid Meta API conflicts.
const META_PLATFORM_ORDER = ["instagram", "facebook"];

async function publishToPlatform(platform, post, dryRun) {
  if (!PLATFORM_HANDLERS[platform]) {
    return { platform, ok: false, error: "Unsupported platform" };
  }

  if (!platformConfigured(platform)) {
    console.warn(`Skipping ${platform}: credentials not configured.`);
    return {
      platform,
      ok: false,
      skipped: true,
      error: "Platform credentials not configured",
    };
  }

  if (dryRun) {
    console.log(`[DRY RUN] Would publish to ${platform}`);
    return { platform, ok: true, dryRun: true };
  }

  try {
    const result = await PLATFORM_HANDLERS[platform](post);
    console.log(`Published to ${platform}:`, result.id ?? result.url ?? "ok");
    return { platform, ok: true, ...result };
  } catch (error) {
    console.error(`Failed on ${platform}:`, error.message);
    return { platform, ok: false, error: error.message };
  }
}

async function publishPost(post, dryRun) {
  console.log(`\nPublishing post: ${post.id}`);
  console.log(`Platforms: ${post.platforms.join(", ")}`);
  console.log(`Caption preview:\n${post.caption.slice(0, 200)}...\n`);

  const metaSet = new Set(META_PLATFORM_ORDER);
  const metaPlatforms = META_PLATFORM_ORDER.filter((platform) =>
    post.platforms.includes(platform)
  );
  const otherPlatforms = post.platforms.filter((platform) => !metaSet.has(platform));

  const metaResults = [];
  for (const platform of metaPlatforms) {
    metaResults.push(await publishToPlatform(platform, post, dryRun));
  }

  const otherResults = await Promise.all(
    otherPlatforms.map((platform) => publishToPlatform(platform, post, dryRun))
  );

  return [...metaResults, ...otherResults];
}

async function main() {
  const args = parseArgs(process.argv, {
    defaults: { postId: "", dryRun: config.dryRun },
    allowPositionalPostId: true,
  });

  const posts = loadPostsToPublish({
    onlyId: args.postId || undefined,
    dryRun: args.dryRun,
  });

  if (posts.length === 0) {
    console.log("No pending posts ready to publish.");
    process.exit(0);
  }

  console.log(`Found ${posts.length} post(s).`);
  if (args.dryRun) console.log("DRY RUN mode — nothing will be posted.");

  let hadFailure = false;

  for (const post of posts) {
    const results = await publishPost(post, args.dryRun);
    const successes = results.filter((r) => r.ok && !r.dryRun);
    const failures = results.filter((r) => !r.ok && !r.skipped);

    if (!args.dryRun && successes.length > 0 && failures.length === 0) {
      markPostPublished(post.filePath, results);
      console.log(`Marked ${post.id} as published.`);
    } else if (!args.dryRun && failures.length > 0) {
      savePostResults(post.filePath, results);
      console.log(
        `Post ${post.id} remains pending (${failures.map((r) => r.platform).join(", ")} failed).`
      );
    }

    if (failures.length > 0) hadFailure = true;
  }

  process.exit(hadFailure ? 1 : 0);
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);

if (isMain) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

export { publishPost };
