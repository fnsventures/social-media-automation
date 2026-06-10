#!/usr/bin/env node
import { loadPendingPosts } from "./lib/content.js";
import { parseArgs } from "./lib/cli.js";

const args = parseArgs(process.argv, {
  defaults: { postId: "" },
  allowPositionalPostId: true,
});

const posts = loadPendingPosts({ onlyId: args.postId || undefined });
process.exit(posts.length > 0 ? 0 : 1);
