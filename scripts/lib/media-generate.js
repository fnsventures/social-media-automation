import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { ROOT } from "./config.js";

export async function downloadImage(url, relativePath) {
  const absolutePath = path.resolve(ROOT, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download image: ${response.status}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(absolutePath, buffer);
  return relativePath;
}

export function createVideoFromImage(relativeImagePath, relativeVideoPath, seconds = 12) {
  const imagePath = path.resolve(ROOT, relativeImagePath);
  const videoPath = path.resolve(ROOT, relativeVideoPath);

  if (!fs.existsSync(imagePath)) {
    throw new Error(`Image not found for video conversion: ${relativeImagePath}`);
  }

  fs.mkdirSync(path.dirname(videoPath), { recursive: true });

  const filter = [
    "scale=1080:1080:force_original_aspect_ratio=decrease",
    "pad=1080:1080:(ow-iw)/2:(oh-ih)/2:black",
    "zoompan=z='min(zoom+0.0008,1.08)':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1080x1080:fps=30",
  ].join(",");

  execSync(
    [
      "ffmpeg -y",
      `-loop 1 -i "${imagePath}"`,
      `-vf "${filter}"`,
      `-t ${seconds}`,
      "-c:v libx264 -pix_fmt yuv420p -movflags +faststart",
      `"${videoPath}"`,
    ].join(" "),
    { stdio: "pipe" }
  );

  return relativeVideoPath;
}
