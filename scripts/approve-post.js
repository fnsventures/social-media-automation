#!/usr/bin/env node
import { approvePost, findPostById } from "./lib/content.js";
import { parseArgs } from "./lib/cli.js";
import { printVerification, verifyPost } from "./lib/post-verify.js";

async function main() {
  const args = parseArgs(process.argv, {
    defaults: { postId: "" },
    allowPositionalPostId: true,
  });

  if (!args.postId) {
    throw new Error("Usage: npm run approve:post -- <post-id>");
  }

  const post = findPostById(args.postId);
  if (!post) throw new Error(`Post not found: ${args.postId}`);

  const check = verifyPost(post);
  if (!printVerification(check)) {
    throw new Error("Fix verification errors before approving.");
  }

  approvePost(args.postId);
  console.log(`Approved "${args.postId}" → status pending (ready to publish).`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
