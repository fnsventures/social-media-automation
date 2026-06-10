#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_PNG = path.resolve(__dirname, "../media/meta-app-icon-1024.png");
const OUT_JPG = path.resolve(__dirname, "../media/meta-app-icon-1024.jpg");

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0B7A3B"/>
      <stop offset="55%" stop-color="#0E9B4C"/>
      <stop offset="100%" stop-color="#F4B400"/>
    </linearGradient>
    <linearGradient id="shine" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.22"/>
      <stop offset="100%" stop-color="#FFFFFF" stop-opacity="0"/>
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="10" stdDeviation="18" flood-color="#083A1E" flood-opacity="0.35"/>
    </filter>
  </defs>

  <rect width="1024" height="1024" rx="220" fill="url(#bg)"/>
  <rect width="1024" height="520" rx="220" fill="url(#shine)"/>

  <g filter="url(#shadow)">
    <rect x="312" y="250" width="400" height="520" rx="48" fill="#FFFFFF"/>
    <rect x="352" y="290" width="320" height="180" rx="24" fill="#0E9B4C"/>
    <rect x="352" y="500" width="320" height="90" rx="18" fill="#E8F5EC"/>
    <rect x="352" y="610" width="320" height="90" rx="18" fill="#E8F5EC"/>
    <rect x="352" y="720" width="320" height="20" rx="10" fill="#D7EADD"/>

    <rect x="430" y="430" width="164" height="28" rx="14" fill="#F4B400"/>
    <circle cx="430" cy="444" r="34" fill="#2D3436"/>
    <circle cx="594" cy="444" r="34" fill="#2D3436"/>
    <circle cx="430" cy="444" r="18" fill="#B2BEC3"/>
    <circle cx="594" cy="444" r="18" fill="#B2BEC3"/>

    <path d="M512 170 L612 250 L412 250 Z" fill="#FFFFFF"/>
    <rect x="482" y="250" width="60" height="70" rx="8" fill="#FFFFFF"/>
    <circle cx="512" cy="210" r="26" fill="#F4B400" stroke="#FFFFFF" stroke-width="10"/>
  </g>

  <text x="512" y="920" text-anchor="middle"
        font-family="Arial, Helvetica, sans-serif"
        font-size="72" font-weight="700" fill="#FFFFFF">BF</text>
</svg>`;

fs.mkdirSync(path.dirname(OUT_PNG), { recursive: true });

const pngBuffer = await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
await sharp(pngBuffer).toFile(OUT_PNG);
await sharp(pngBuffer).jpeg({ quality: 92 }).toFile(OUT_JPG);

const meta = await sharp(OUT_PNG).metadata();
const pngSize = fs.statSync(OUT_PNG).size;
const jpgSize = fs.statSync(OUT_JPG).size;
console.log(`Created ${OUT_PNG} (${meta.width}x${meta.height}, ${(pngSize / 1024).toFixed(1)} KB)`);
console.log(`Created ${OUT_JPG} (${meta.width}x${meta.height}, ${(jpgSize / 1024).toFixed(1)} KB)`);
