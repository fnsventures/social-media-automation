#!/usr/bin/env node
import { saveGeneratedPost } from "./lib/content.js";
import { config } from "./lib/config.js";

const BRAND = {
  name: "Bishnupriya Fuels",
  location: "Padmalavpur, Manduka, Jajpur, Odisha 754205",
  services: "BPCL petrol, diesel, lubricants, fleet fueling",
  whatsapp: "+91 96689 13299",
};

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

async function generateWithOpenAI(topic) {
  if (!config.openai.apiKey) {
    throw new Error("OPENAI_API_KEY is required for content generation.");
  }

  const prompt = `Create one social media post for ${BRAND.name}, a Bharat Petroleum outlet in ${BRAND.location}.
Services: ${BRAND.services}. WhatsApp: ${BRAND.whatsapp}.
Topic: ${topic}

Return JSON only with keys:
- title (short, for YouTube if video attached)
- caption (multi-line post text, professional and local, include WhatsApp CTA)
- hashtags (array of 5 strings without # prefix)`;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.openai.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.openai.model,
      messages: [
        { role: "system", content: "You write social posts for a fuel station. Output valid JSON only." },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error?.message ?? "OpenAI request failed");
  }

  return JSON.parse(data.choices[0].message.content);
}

async function main() {
  const topic =
    process.argv.slice(2).join(" ") ||
    "monsoon driving safety and tyre care for highway travelers";

  console.log(`Generating content for topic: ${topic}`);
  const generated = await generateWithOpenAI(topic);
  const id = `${slugify(topic)}-${Date.now()}`;

  const post = {
    id,
    status: "pending",
    publish_at: "",
    platforms: ["facebook", "instagram", "twitter"],
    title: generated.title,
    caption: generated.caption,
    hashtags: generated.hashtags,
    media: {},
    generated_at: new Date().toISOString(),
    topic,
  };

  const filePath = saveGeneratedPost(post);
  console.log(`Saved draft post: ${filePath}`);
  console.log("Add an image under media/ and set media.image in the YAML before publishing to Instagram.");
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
