import { config } from "./config.js";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildImagePrompt(prompt) {
  return (
    `${prompt}. Photorealistic modern Indian highway fuel station, warm daylight, ` +
    "clean forecourt, no readable logos or brand text."
  );
}

async function fetchImage(url) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(url);

    if (response.status === 429 || response.status === 402) {
      await sleep(16000);
      continue;
    }

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(
        `Pollinations image failed (${response.status})${detail ? `: ${detail.slice(0, 160)}` : ""}`
      );
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("image")) {
      throw new Error("Pollinations did not return an image.");
    }

    return Buffer.from(await response.arrayBuffer());
  }

  throw new Error(
    "Pollinations rate limit reached. Add a free API key from https://enter.pollinations.ai as POLLINATIONS_API_KEY."
  );
}

export async function generateImage(prompt) {
  const imagePrompt = buildImagePrompt(prompt);

  if (config.pollinations.apiKey) {
    const params = new URLSearchParams({
      model: config.pollinations.model,
      width: "1024",
      height: "1024",
      key: config.pollinations.apiKey,
      nologo: "true",
    });
    const url = `https://gen.pollinations.ai/image/${encodeURIComponent(imagePrompt)}?${params}`;
    return fetchImage(url);
  }

  const params = new URLSearchParams({
    width: "1024",
    height: "1024",
    model: config.pollinations.model,
  });
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(imagePrompt)}?${params}`;
  return fetchImage(url);
}
