#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, "../media/first-post.jpg");

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1080" height="1080" viewBox="0 0 1080 1080" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="sky" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0A6B35"/>
      <stop offset="45%" stop-color="#0E9B4C"/>
      <stop offset="100%" stop-color="#1CB85E"/>
    </linearGradient>
    <linearGradient id="road" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#2D3436"/>
      <stop offset="100%" stop-color="#1E272E"/>
    </linearGradient>
    <linearGradient id="canopy" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#F4B400"/>
      <stop offset="50%" stop-color="#FFD54F"/>
      <stop offset="100%" stop-color="#F4B400"/>
    </linearGradient>
    <filter id="cardShadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="8" stdDeviation="16" flood-color="#000000" flood-opacity="0.28"/>
    </filter>
  </defs>

  <rect width="1080" height="1080" fill="url(#sky)"/>

  <!-- subtle pattern -->
  <circle cx="920" cy="120" r="180" fill="#FFFFFF" opacity="0.06"/>
  <circle cx="120" cy="860" r="220" fill="#FFFFFF" opacity="0.05"/>

  <!-- forecourt canopy -->
  <rect x="0" y="300" width="1080" height="120" fill="url(#canopy)"/>
  <rect x="0" y="300" width="1080" height="18" fill="#E6A800"/>
  <text x="540" y="378" text-anchor="middle" font-family="Arial, Helvetica, sans-serif"
        font-size="42" font-weight="700" fill="#1E272E" letter-spacing="6">BHARAT PETROLEUM</text>

  <!-- pump island -->
  <rect x="0" y="420" width="1080" height="660" fill="url(#road)"/>
  <rect x="80" y="500" width="920" height="420" rx="24" fill="#636E72" opacity="0.35"/>
  <rect x="140" y="560" width="180" height="280" rx="16" fill="#FFFFFF"/>
  <rect x="160" y="590" width="140" height="90" rx="10" fill="#0E9B4C"/>
  <rect x="160" y="700" width="140" height="50" rx="8" fill="#F4B400"/>
  <rect x="175" y="770" width="110" height="40" rx="8" fill="#DFE6E9"/>
  <rect x="450" y="560" width="180" height="280" rx="16" fill="#FFFFFF"/>
  <rect x="470" y="590" width="140" height="90" rx="10" fill="#0E9B4C"/>
  <rect x="470" y="700" width="140" height="50" rx="8" fill="#F4B400"/>
  <rect x="485" y="770" width="110" height="40" rx="8" fill="#DFE6E9"/>
  <rect x="760" y="560" width="180" height="280" rx="16" fill="#FFFFFF"/>
  <rect x="780" y="590" width="140" height="90" rx="10" fill="#0E9B4C"/>
  <rect x="780" y="700" width="140" height="50" rx="8" fill="#F4B400"/>
  <rect x="795" y="770" width="110" height="40" rx="8" fill="#DFE6E9"/>

  <!-- main content card -->
  <g filter="url(#cardShadow)">
    <rect x="60" y="60" width="960" height="210" rx="28" fill="#FFFFFF"/>
  </g>
  <text x="540" y="118" text-anchor="middle" font-family="Arial, Helvetica, sans-serif"
        font-size="54" font-weight="700" fill="#0A6B35">Bishnupriya Fuels</text>
  <text x="540" y="162" text-anchor="middle" font-family="Arial, Helvetica, sans-serif"
        font-size="26" fill="#636E72">A F&amp;S Ventures Company</text>
  <text x="540" y="210" text-anchor="middle" font-family="Arial, Helvetica, sans-serif"
        font-size="28" font-weight="600" fill="#1E272E">Trusted fuel stop for smooth journeys</text>

  <!-- bottom info bar -->
  <rect x="0" y="900" width="1080" height="180" fill="#083A1E" opacity="0.92"/>
  <text x="540" y="948" text-anchor="middle" font-family="Arial, Helvetica, sans-serif"
        font-size="24" font-weight="600" fill="#FFD54F">Petrol · Diesel · Lubricants · Fleet Support</text>
  <text x="540" y="988" text-anchor="middle" font-family="Arial, Helvetica, sans-serif"
        font-size="22" fill="#FFFFFF">Padmalavpur, Manduka, Jajpur · 754205</text>
  <text x="540" y="1028" text-anchor="middle" font-family="Arial, Helvetica, sans-serif"
        font-size="20" fill="#B2DFDB">bishnupriyafuels.fnsventures.in · WhatsApp +91 96689 13299</text>
</svg>`;

fs.mkdirSync(path.dirname(OUT), { recursive: true });
await sharp(Buffer.from(svg)).jpeg({ quality: 92 }).toFile(OUT);

const meta = await sharp(OUT).metadata();
console.log(`Created ${OUT} (${meta.width}x${meta.height})`);
