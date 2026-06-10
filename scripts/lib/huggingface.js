import { config } from "./config.js";

export async function generateImage(prompt) {
  if (!config.huggingface.apiKey) {
    throw new Error(
      "HF_TOKEN is required. Create a free token at https://huggingface.co/settings/tokens (enable Inference Providers)."
    );
  }

  const imagePrompt =
    `${prompt}. Photorealistic modern Indian highway fuel station, warm daylight, ` +
    "clean forecourt, no readable logos or brand text.";

  const response = await fetch(
    `https://router.huggingface.co/hf-inference/models/${config.huggingface.imageModel}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.huggingface.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        inputs: imagePrompt,
        parameters: {
          width: 1024,
          height: 1024,
        },
      }),
    }
  );

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      `Hugging Face image failed (${response.status})${detail ? `: ${detail.slice(0, 200)}` : ""}`
    );
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("image")) {
    throw new Error("Hugging Face did not return an image.");
  }

  return Buffer.from(await response.arrayBuffer());
}
