import { config } from "./config.js";
import { saveImageBuffer } from "./media-generate.js";
import * as gemini from "./gemini.js";
import * as huggingface from "./huggingface.js";
import * as local from "./generate-local.js";
import * as pollinations from "./pollinations.js";

function resolveImageProvider() {
  if (config.imageProvider) return config.imageProvider;
  if (config.generationProvider === "pollinations") return "pollinations";
  if (config.generationProvider === "gemini") return "gemini";
  return "local";
}

export function providerName() {
  const imageProvider = resolveImageProvider();
  if (config.generationProvider === imageProvider) {
    return config.generationProvider;
  }
  return `${config.generationProvider}+${imageProvider}`;
}

export function imageProviderName() {
  return resolveImageProvider();
}

export async function generatePostCopy(topic) {
  if (config.generationProvider === "gemini") {
    return gemini.generatePostCopy(topic);
  }
  return local.generatePostCopy(topic);
}

export async function generateAndSaveImage(prompt, relativePath) {
  switch (resolveImageProvider()) {
    case "pollinations": {
      const buffer = await pollinations.generateImage(prompt);
      saveImageBuffer(buffer, relativePath);
      return relativePath;
    }
    case "huggingface": {
      const buffer = await huggingface.generateImage(prompt);
      saveImageBuffer(buffer, relativePath);
      return relativePath;
    }
    case "gemini": {
      const buffer = await gemini.generateImage(prompt);
      saveImageBuffer(buffer, relativePath);
      return relativePath;
    }
    default:
      return local.generateBrandedImage(prompt, relativePath);
  }
}

export function describeProvider() {
  const textProvider =
    config.generationProvider === "gemini"
      ? "Gemini caption"
      : "Local caption template";

  switch (resolveImageProvider()) {
    case "pollinations":
      return `${textProvider} + Pollinations AI image (free)`;
    case "huggingface":
      return `${textProvider} + Hugging Face image (free credits)`;
    case "gemini":
      return `${textProvider} + Gemini image`;
    default:
      return "Local templates (free — no API key)";
  }
}
