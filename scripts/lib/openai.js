import { config } from "./config.js";
import { BRAND } from "./brand.js";

async function openaiRequest(path, body) {
  const response = await fetch(`https://api.openai.com/v1/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.openai.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error?.message ?? `OpenAI request failed: ${path}`);
  }
  return data;
}

export async function generatePostCopy(topic) {
  if (!config.openai.apiKey) {
    throw new Error("OPENAI_API_KEY is required for content generation.");
  }

  const prompt = `Create one social media post for ${BRAND.name}, a Bharat Petroleum outlet in ${BRAND.location}.
Services: ${BRAND.services}. Website: ${BRAND.website}. WhatsApp: ${BRAND.whatsapp}.
Topic: ${topic}

Return JSON only with keys:
- title (short, for YouTube if video attached)
- caption (multi-line post text, professional and local, include WhatsApp CTA)
- hashtags (array of 5 strings without # prefix)
- image_prompt (one sentence visual for a promotional photo, clean modern Indian highway fuel station, no logos or readable brand text)`;

  const data = await openaiRequest("chat/completions", {
    model: config.openai.model,
    messages: [
      {
        role: "system",
        content:
          "You write social posts for a fuel station. Output valid JSON only. Image prompts must avoid copyrighted logos.",
      },
      { role: "user", content: prompt },
    ],
    response_format: { type: "json_object" },
  });

  return JSON.parse(data.choices[0].message.content);
}

export async function generateImage(prompt) {
  if (!config.openai.apiKey) {
    throw new Error("OPENAI_API_KEY is required for image generation.");
  }

  const data = await openaiRequest("images/generations", {
    model: config.openai.imageModel,
    prompt,
    size: "1024x1024",
    quality: "standard",
    n: 1,
  });

  const url = data.data?.[0]?.url;
  if (!url) throw new Error("OpenAI did not return an image URL.");
  return url;
}
