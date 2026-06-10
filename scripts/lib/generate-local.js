import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { BRAND } from "./brand.js";
import { ROOT } from "./config.js";

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function wrapTopic(topic, maxLine = 34, maxLines = 3) {
  const words = topic.trim().split(/\s+/);
  const lines = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= maxLine) {
      current = next;
    } else if (current) {
      lines.push(current);
      current = word;
    } else {
      lines.push(word.slice(0, maxLine));
      current = "";
    }
    if (lines.length >= maxLines) break;
  }

  if (current && lines.length < maxLines) lines.push(current);
  return lines.slice(0, maxLines);
}

function topicHashtags(topic) {
  const base = ["BishnupriyaFuels", "BPCL", "Jajpur", "Odisha", "BharatPetroleum"];
  const words = topic
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter((word) => word.length > 3)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1));

  return [...new Set([...base, ...words])].slice(0, 6);
}

export function generatePostCopy(topic) {
  const cleanTopic = topic.trim();
  const title = `${BRAND.name} — ${cleanTopic}`.slice(0, 90);

  const caption = [
    `${BRAND.name} — your Bharat Petroleum outlet on the Jajpur route.`,
    "",
    cleanTopic,
    "",
    "✓ Clean forecourt & quick service",
    "✓ Petrol, diesel & lubricants",
    "✓ Fleet fueling support",
    "",
    `Visit us at ${BRAND.location}`,
    `Learn more: ${BRAND.website}`,
    `WhatsApp: ${BRAND.whatsapp}`,
  ].join("\n");

  return {
    title,
    caption,
    hashtags: topicHashtags(cleanTopic),
    image_prompt: cleanTopic,
  };
}

export async function generateBrandedImage(topic, relativePath) {
  const lines = wrapTopic(topic);
  const lineElements = lines
    .map((line, index) => {
      const y = 210 + index * 34;
      return `<text x="540" y="${y}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif"
        font-size="28" font-weight="600" fill="#1E272E">${escapeXml(line)}</text>`;
    })
    .join("\n");

  const cardHeight = 150 + lines.length * 34;

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1080" height="1080" viewBox="0 0 1080 1080" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="sky" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0A6B35"/>
      <stop offset="45%" stop-color="#0E9B4C"/>
      <stop offset="100%" stop-color="#1CB85E"/>
    </linearGradient>
    <linearGradient id="canopy" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#F4B400"/>
      <stop offset="100%" stop-color="#FFD54F"/>
    </linearGradient>
  </defs>
  <rect width="1080" height="1080" fill="url(#sky)"/>
  <rect x="0" y="300" width="1080" height="110" fill="url(#canopy)"/>
  <text x="540" y="370" text-anchor="middle" font-family="Arial, Helvetica, sans-serif"
        font-size="38" font-weight="700" fill="#1E272E" letter-spacing="4">BHARAT PETROLEUM</text>
  <rect x="60" y="60" width="960" height="${cardHeight}" rx="28" fill="#FFFFFF"/>
  <text x="540" y="118" text-anchor="middle" font-family="Arial, Helvetica, sans-serif"
        font-size="50" font-weight="700" fill="#0A6B35">${escapeXml(BRAND.name)}</text>
  <text x="540" y="162" text-anchor="middle" font-family="Arial, Helvetica, sans-serif"
        font-size="24" fill="#636E72">A F&amp;S Ventures Company</text>
  ${lineElements}
  <rect x="0" y="900" width="1080" height="180" fill="#083A1E" opacity="0.92"/>
  <text x="540" y="948" text-anchor="middle" font-family="Arial, Helvetica, sans-serif"
        font-size="24" font-weight="600" fill="#FFD54F">Petrol · Diesel · Lubricants · Fleet Support</text>
  <text x="540" y="988" text-anchor="middle" font-family="Arial, Helvetica, sans-serif"
        font-size="22" fill="#FFFFFF">${escapeXml(BRAND.location)}</text>
  <text x="540" y="1028" text-anchor="middle" font-family="Arial, Helvetica, sans-serif"
        font-size="20" fill="#B2DFDB">${escapeXml(BRAND.website.replace("https://", ""))} · WhatsApp ${escapeXml(BRAND.whatsapp)}</text>
</svg>`;

  const absolutePath = path.resolve(ROOT, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  await sharp(Buffer.from(svg)).jpeg({ quality: 92 }).toFile(absolutePath);
  return relativePath;
}
