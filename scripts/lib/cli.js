export function parseArgs(argv, spec = {}) {
  const args = { ...spec.defaults };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--post" && argv[i + 1]) {
      args.postId = argv[++i];
      continue;
    }

    if (arg === "--dry-run") {
      args.dryRun = true;
      continue;
    }

    if (arg === "--verify-only") {
      args.verifyOnly = true;
      continue;
    }

    if (arg === "--for-publish") {
      args.forPublish = true;
      continue;
    }

    if (arg === "--all-review") {
      args.allReview = true;
      continue;
    }

    if (!arg.startsWith("--") && !args.postId && spec.allowPositionalPostId) {
      args.postId = arg;
    }
  }

  return args;
}
