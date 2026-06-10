import { config } from "./config.js";
import { BRAND } from "./brand.js";

const BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

async function geminiRequest(model, body) {
  if (!config.gemini.apiKey) {
    throw new Error(
      "GEMINI_API_KEY is required. Get a free key at https://aistudio.google.com/apikey"
    );
  }

  const response = await fetch(`${BASE_URL}/models/${model}:generateContent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": config.gemini.apiKey,
    },
    body: JSON.stringify(body),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(
      data.error?.message ?? `Gemini request failed (${model})`
    );
  }
  return data;
}

function extractText(data) {
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  return parts.map((part) => part.text ?? "").join("").trim();
}

function extractImageBuffer(data) {
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  for (const part of parts) {
    const inline = part.inlineData ?? part.inline_data;
    if (inline?.data) {
      return Buffer.from(inline.data, "base64");
    }
  }
  return null;
}

export async function generatePostCopy(topic) {
  const prompt = `Create one social media post for ${BRAND.name}, a Bharat Petroleum outlet in ${BRAND.location}.
Services: ${BRAND.services}. Website: ${BRAND.website}. WhatsApp: ${BRAND.whatsapp}.
Topic: ${topic}

Return JSON only with keys:
- title (short, for YouTube if video attached)
- caption (multi-line post text, professional and local, include WhatsApp CTA)
- hashtags (array of 5 strings without # prefix)
- image_prompt (one sentence visual for a promotional photo, clean modern Indian highway fuel station, no logos or readable brand text)`;

  const data = await geminiRequest(config.gemini.textModel, {
    contents: [{ parts: [{ text: prompt }] }],
    systemInstruction: {
      parts: [
        {
          text:
            "You write social posts for a fuel station. Output valid JSON only. Image prompts must avoid copyrighted logos.",
        },
      ],
    },
    generationConfig: {
      responseMimeType: "application/json",
    },
  });

  const text = extractText(data);
  if (!text) {
    throw new Error("Gemini did not return post copy.");
  }

  return JSON.parse(text);
}

export async function generateImage(prompt) {
  const imagePrompt = `Create a promotional photo: ${prompt}. Clean modern Indian highway fuel station scene, warm daylight, no readable logos or brand text.`;

  const data = await geminiRequest(config.gemini.imageModel, {
    contents: [{ parts: [{ text: imagePrompt }] }],
    generationConfig: {
      responseModalities: ["TEXT", "IMAGE"],
    },
  });

  const buffer = extractImageBuffer(data);
  if (!buffer) {
    throw new Error("Gemini did not return an image.");
  }
  return buffer;
}
