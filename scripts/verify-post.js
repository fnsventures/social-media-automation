#!/usr/bin/env node
import { findPostById, loadPostsByStatus } from "./lib/content.js";
import { parseArgs } from "./lib/cli.js";
import { printVerification, verifyPost } from "./lib/post-verify.js";

async function main() {
  const args = parseArgs(process.argv, {
    defaults: { postId: "", allReview: false, forPublish: false },
    allowPositionalPostId: true,
  });

  const posts = args.allReview
    ? loadPostsByStatus("review")
    : args.postId
      ? [findPostById(args.postId)].filter(Boolean)
      : loadPostsByStatus("review");

  if (posts.length === 0) {
    console.log("No posts to verify.");
    if (args.postId) console.log(`Post not found: ${args.postId}`);
    process.exit(args.postId ? 1 : 0);
  }

  let allOk = true;
  for (const post of posts) {
    const result = verifyPost(post, { forPublish: args.forPublish });
    allOk = printVerification(result) && allOk;
    console.log("");
  }

  process.exit(allOk ? 0 : 1);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
