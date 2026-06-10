#!/usr/bin/env node
import { approvePost, findPostById, markPostPublished, savePostResults } from "./lib/content.js";
import { parseArgs } from "./lib/cli.js";
import { platformConfigured } from "./lib/config.js";
import { printVerification, verifyPost } from "./lib/post-verify.js";
import { verifyYoutubeCredentials } from "./lib/youtube.js";
import { publishPost } from "./publish.js";

async function verifyCredentialsForPost(post) {
  console.log("Credential check\n");

  for (const platform of post.platforms ?? []) {
    const ok = platformConfigured(platform);
    console.log(`${ok ? "OK" : "MISSING"}  ${platform}`);
  }

  if (post.platforms?.includes("youtube") && platformConfigured("youtube")) {
    const channel = await verifyYoutubeCredentials();
    console.log(`YouTube connected as "${channel}"`);
  }
}

async function main() {
  const args = parseArgs(process.argv, {
    defaults: { postId: "", dryRun: false, verifyOnly: false },
    allowPositionalPostId: true,
  });

  if (!args.postId) {
    throw new Error(
      "Usage: node scripts/publish-pipeline.js --post <post-id> [--dry-run] [--verify-only]"
    );
  }

  const post = findPostById(args.postId);
  if (!post) throw new Error(`Post not found: ${args.postId}`);

  const initialCheck = verifyPost(post, { forPublish: false });
  if (!printVerification(initialCheck)) process.exit(1);

  if (args.verifyOnly) process.exit(0);

  if (!args.dryRun && post.status === "review") {
    approvePost(args.postId);
  }

  const toPublish = findPostById(args.postId);
  if (!args.dryRun) {
    const publishCheck = verifyPost(toPublish, { forPublish: true });
    if (!printVerification(publishCheck)) process.exit(1);
  }

  await verifyCredentialsForPost(toPublish);

  const results = await publishPost(toPublish, args.dryRun);
  const successes = results.filter((r) => r.ok && !r.dryRun);
  const failures = results.filter((r) => !r.ok && !r.skipped);

  if (!args.dryRun && successes.length > 0 && failures.length === 0) {
    markPostPublished(toPublish.filePath, results);
    console.log(`Marked ${toPublish.id} as published.`);
  } else if (!args.dryRun && failures.length > 0) {
    savePostResults(toPublish.filePath, results);
    console.log(
      `Post ${toPublish.id} remains pending (${failures.map((r) => r.platform).join(", ")} failed).`
    );
  }

  if (failures.length > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
