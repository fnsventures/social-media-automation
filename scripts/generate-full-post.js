#!/usr/bin/env node
import { slugify } from "./lib/brand.js";
import { config } from "./lib/config.js";
import { saveGeneratedPost } from "./lib/content.js";
import {
  describeProvider,
  generateAndSaveImage,
  generatePostCopy,
  imageProviderName,
  providerName,
} from "./lib/generate-provider.js";
import { createVideoFromImage } from "./lib/media-generate.js";

function parseArgs(argv) {
  const args = {
    topic: "",
    media: "image",
    platforms: ["facebook", "instagram", "youtube"],
    status: "review",
  };

  const positional = [];
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--media" && argv[i + 1]) {
      args.media = argv[++i];
    } else if (arg === "--platforms" && argv[i + 1]) {
      args.platforms = argv[++i].split(",").map((s) => s.trim()).filter(Boolean);
    } else if (arg === "--status" && argv[i + 1]) {
      args.status = argv[++i];
    } else if (!arg.startsWith("--")) {
      positional.push(arg);
    }
  }

  args.topic =
    positional.join(" ") ||
    "monsoon driving safety and tyre care for highway travelers";

  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  const id = `${slugify(args.topic)}-${Date.now()}`;
  const mediaBase = `media/${id}`;

  console.log(`Generating AI post: ${args.topic}`);
  console.log(`Provider: ${describeProvider()} (${providerName()})`);
  console.log(`Media mode: ${args.media}`);
  console.log(`Platforms: ${args.platforms.join(", ")}`);
  console.log(`Initial status: ${args.status}\n`);

  const generated = await generatePostCopy(args.topic);
  const media = {};

  if (args.media === "image" || args.media === "both") {
    console.log("Generating image...");
    const imagePath = `${mediaBase}.jpg`;
    await generateAndSaveImage(generated.image_prompt ?? args.topic, imagePath);
    media.image = imagePath;
    console.log(`Saved image: ${imagePath}`);
  }

  if (args.media === "video" || args.media === "both") {
    if (!media.image) {
      console.log("Generating base image...");
      const imagePath = `${mediaBase}.jpg`;
      await generateAndSaveImage(generated.image_prompt ?? args.topic, imagePath);
      media.image = imagePath;
    }

    console.log("Creating short video from image...");
    const videoPath = `${mediaBase}.mp4`;
    createVideoFromImage(media.image, videoPath);
    media.video = videoPath;
    console.log(`Saved video: ${videoPath}`);
  }

  const post = {
    id,
    status: args.status,
    publish_at: "",
    platforms: args.platforms,
    title: generated.title,
    caption: generated.caption,
    hashtags: generated.hashtags,
    media,
    generated_at: new Date().toISOString(),
    topic: args.topic,
    ai: {
      provider: providerName(),
      text_provider: config.generationProvider,
      image_provider: imageProviderName(),
      image_prompt: generated.image_prompt ?? args.topic,
      media_mode: args.media,
    },
  };

  const filePath = saveGeneratedPost(post);
  console.log(`\nSaved post: ${filePath}`);
  console.log("\nNext steps:");
  console.log("  1. Review caption and media in the repo");
  console.log(`  2. npm run verify:post -- ${id}`);
  console.log(`  3. npm run approve:post -- ${id}`);
  console.log(`  4. npm run publish -- --post ${id}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
