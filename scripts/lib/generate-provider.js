import { config } from "./config.js";
import { saveImageBuffer } from "./media-generate.js";
import * as gemini from "./gemini.js";
import * as local from "./generate-local.js";

export function providerName() {
  return config.generationProvider;
}

export async function generatePostCopy(topic) {
  if (config.generationProvider === "gemini") {
    return gemini.generatePostCopy(topic);
  }
  return local.generatePostCopy(topic);
}

export async function generateAndSaveImage(prompt, relativePath) {
  if (config.generationProvider === "gemini") {
    const buffer = await gemini.generateImage(prompt);
    saveImageBuffer(buffer, relativePath);
    return relativePath;
  }
  return local.generateBrandedImage(prompt, relativePath);
}

export function describeProvider() {
  if (config.generationProvider === "gemini") {
    return "Google Gemini (caption + image)";
  }
  return "Local templates (free — no API key)";
}
