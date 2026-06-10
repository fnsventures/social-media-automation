#!/usr/bin/env node
import { approvePost, findPostById } from "./lib/content.js";
import { printVerification, verifyPost } from "./lib/post-verify.js";

function parseArgs(argv) {
  let postId = "";
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === "--post" && argv[i + 1]) postId = argv[++i];
    else if (!argv[i].startsWith("--")) postId = argv[i];
  }
  return { postId };
}

async function main() {
  const { postId } = parseArgs(process.argv);
  if (!postId) {
    throw new Error("Usage: npm run approve:post -- <post-id>");
  }

  const post = findPostById(postId);
  if (!post) throw new Error(`Post not found: ${postId}`);

  const check = verifyPost(post);
  if (!printVerification(check)) {
    throw new Error("Fix verification errors before approving.");
  }

  approvePost(postId);
  console.log(`Approved "${postId}" → status pending (ready to publish).`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
