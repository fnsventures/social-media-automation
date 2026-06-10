#!/usr/bin/env node
import { saveGeneratedPost } from "./lib/content.js";
import { generatePostCopy } from "./lib/openai.js";
import { slugify } from "./lib/brand.js";

async function main() {
  const topic =
    process.argv.slice(2).join(" ") ||
    "monsoon driving safety and tyre care for highway travelers";

  console.log(`Generating caption-only post for topic: ${topic}`);
  const generated = await generatePostCopy(topic);
  const id = `${slugify(topic)}-${Date.now()}`;

  const post = {
    id,
    status: "review",
    publish_at: "",
    platforms: ["facebook", "instagram", "youtube"],
    title: generated.title,
    caption: generated.caption,
    hashtags: generated.hashtags,
    media: {},
    generated_at: new Date().toISOString(),
    topic,
  };

  const filePath = saveGeneratedPost(post);
  console.log(`Saved draft post: ${filePath}`);
  console.log("Run npm run generate:full for AI image/video, or attach media manually.");
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
