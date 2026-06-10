import { platformConfigured } from "./config.js";

export function verifyPost(post, { forPublish = false } = {}) {
  const errors = [];
  const warnings = [];

  if (!post.id) errors.push("Missing post id.");
  if (!post.platforms?.length) errors.push("No platforms selected.");

  if (forPublish && post.status !== "pending") {
    errors.push(`Status is "${post.status}" — must be "pending" to publish.`);
  }

  if (post.status === "review") {
    warnings.push("Post is awaiting approval (status: review).");
  }

  for (const platform of post.platforms ?? []) {
    if (!platformConfigured(platform)) {
      warnings.push(`${platform}: credentials not configured (will skip on publish).`);
    }

    if (platform === "instagram" && !post.imagePath && !post.videoPath) {
      errors.push("Instagram requires media.image or media.video.");
    }

    if (platform === "youtube" && !post.videoPath && !post.imagePath) {
      errors.push("YouTube requires media.image or media.video.");
    }

    if (platform === "youtube" && !post.videoPath && post.imagePath) {
      warnings.push("YouTube will auto-create a short video from the image.");
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    summary: {
      id: post.id,
      status: post.status,
      platforms: post.platforms,
      image: post.imagePath,
      video: post.videoPath,
    },
  };
}

export function printVerification(result) {
  const { summary, errors, warnings, ok } = result;
  console.log(`Post: ${summary.id}`);
  console.log(`Status: ${summary.status}`);
  console.log(`Platforms: ${(summary.platforms ?? []).join(", ") || "(none)"}`);
  if (summary.image) console.log(`Image: ${summary.image}`);
  if (summary.video) console.log(`Video: ${summary.video}`);
  console.log("");

  for (const warning of warnings) console.log(`WARN  ${warning}`);
  for (const error of errors) console.log(`ERROR ${error}`);

  console.log(ok ? "\nVerification passed." : "\nVerification failed.");
  return ok;
}
