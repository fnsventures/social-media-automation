import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { ROOT } from "./config.js";

const DEFAULT_MUSIC = path.join(ROOT, "media/audio/background-music.mp3");
const YOUTUBE_WIDTH = 1920;
const YOUTUBE_HEIGHT = 1080;
const YOUTUBE_FPS = 30;
const MUSIC_VOLUME = 0.32;
const MUSIC_DUCK_VOLUME = 0.18;

function shellQuote(value) {
  return `"${String(value).replace(/"/g, '\\"')}"`;
}

function runFfmpeg(args) {
  execSync(["ffmpeg", "-y", ...args].join(" "), { stdio: "pipe" });
}

function resolveMusicPath() {
  if (!fs.existsSync(DEFAULT_MUSIC)) {
    throw new Error(
      "Background music not found at media/audio/background-music.mp3"
    );
  }
  return DEFAULT_MUSIC;
}

function probeHasAudio(videoPath) {
  try {
    const output = execSync(
      `ffprobe -v error -select_streams a:0 -show_entries stream=codec_type -of csv=p=0 ${shellQuote(videoPath)}`,
      { encoding: "utf8", stdio: "pipe" }
    );
    return output.trim() === "audio";
  } catch {
    return false;
  }
}

function probeDuration(videoPath) {
  const output = execSync(
    `ffprobe -v error -show_entries format=duration -of csv=p=0 ${shellQuote(videoPath)}`,
    { encoding: "utf8", stdio: "pipe" }
  );
  const duration = Number.parseFloat(output.trim());
  return Number.isFinite(duration) && duration > 0 ? duration : 12;
}

function buildVideoFilter(duration) {
  const fadeOutStart = Math.max(0, duration - 0.8).toFixed(3);
  return [
    `scale=${YOUTUBE_WIDTH}:${YOUTUBE_HEIGHT}:force_original_aspect_ratio=decrease`,
    `pad=${YOUTUBE_WIDTH}:${YOUTUBE_HEIGHT}:(ow-iw)/2:(oh-ih)/2:black`,
    `zoompan=z='min(zoom+0.0006,1.06)':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${YOUTUBE_WIDTH}x${YOUTUBE_HEIGHT}:fps=${YOUTUBE_FPS}`,
    "eq=contrast=1.05:saturation=1.08:brightness=0.02",
    "vignette=angle=PI/4:mode=forward",
    "fade=t=in:st=0:d=0.8",
    `fade=t=out:st=${fadeOutStart}:d=0.8`,
  ].join(",");
}

function buildEnhanceVideoFilter(duration) {
  const fadeOutStart = Math.max(0, duration - 0.6).toFixed(3);
  return [
    `scale=${YOUTUBE_WIDTH}:${YOUTUBE_HEIGHT}:force_original_aspect_ratio=decrease`,
    `pad=${YOUTUBE_WIDTH}:${YOUTUBE_HEIGHT}:(ow-iw)/2:(oh-ih)/2:black`,
    "eq=contrast=1.04:saturation=1.06:brightness=0.01",
    "fade=t=in:st=0:d=0.5",
    `fade=t=out:st=${fadeOutStart}:d=0.6`,
  ].join(",");
}

function buildMusicFilter(duration, volume) {
  const fadeOutStart = Math.max(0, duration - 2).toFixed(3);
  return [
    `atrim=0:${duration.toFixed(3)}`,
    "asetpts=PTS-STARTPTS",
    "afade=t=in:st=0:d=1.2",
    `afade=t=out:st=${fadeOutStart}:d=2`,
    `volume=${volume}`,
  ].join(",");
}

function encodeOutputArgs() {
  return [
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-preset",
    "medium",
    "-crf",
    "20",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-ar",
    "44100",
    "-movflags",
    "+faststart",
  ];
}

export function createVideoFromImage(relativeImagePath, relativeVideoPath, seconds = 12) {
  const imagePath = path.resolve(ROOT, relativeImagePath);
  const videoPath = path.resolve(ROOT, relativeVideoPath);
  const musicPath = resolveMusicPath();

  if (!fs.existsSync(imagePath)) {
    throw new Error(`Image not found for video conversion: ${relativeImagePath}`);
  }

  fs.mkdirSync(path.dirname(videoPath), { recursive: true });

  const videoFilter = buildVideoFilter(seconds);
  const musicFilter = buildMusicFilter(seconds, MUSIC_VOLUME);

  runFfmpeg([
    `-loop 1 -i ${shellQuote(imagePath)}`,
    `-i ${shellQuote(musicPath)}`,
    `-filter_complex "[0:v]${videoFilter}[v];[1:a]${musicFilter}[a]"`,
    `-map "[v]" -map "[a]"`,
    `-t ${seconds}`,
    ...encodeOutputArgs(),
    shellQuote(videoPath),
  ]);

  return relativeVideoPath;
}

export function enhanceVideoWithMusic(relativeVideoPath, relativeOutputPath) {
  const inputPath = path.resolve(ROOT, relativeVideoPath);
  const outputPath = path.resolve(ROOT, relativeOutputPath);
  const musicPath = resolveMusicPath();

  if (!fs.existsSync(inputPath)) {
    throw new Error(`Video not found for enhancement: ${relativeVideoPath}`);
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  const duration = probeDuration(inputPath);
  const hasAudio = probeHasAudio(inputPath);
  const videoFilter = buildEnhanceVideoFilter(duration);
  const musicFilter = buildMusicFilter(duration, hasAudio ? MUSIC_DUCK_VOLUME : MUSIC_VOLUME);

  if (hasAudio) {
    runFfmpeg([
      `-i ${shellQuote(inputPath)}`,
      `-i ${shellQuote(musicPath)}`,
      `-filter_complex "[0:v]${videoFilter}[v];[1:a]${musicFilter}[music];[0:a]volume=1[orig];[orig][music]amix=inputs=2:duration=first:dropout_transition=2[a]"`,
      `-map "[v]" -map "[a]"`,
      `-t ${duration.toFixed(3)}`,
      ...encodeOutputArgs(),
      shellQuote(outputPath),
    ]);
  } else {
    runFfmpeg([
      `-i ${shellQuote(inputPath)}`,
      `-i ${shellQuote(musicPath)}`,
      `-filter_complex "[0:v]${videoFilter}[v];[1:a]${musicFilter}[a]"`,
      `-map "[v]" -map "[a]"`,
      `-t ${duration.toFixed(3)}`,
      ...encodeOutputArgs(),
      shellQuote(outputPath),
    ]);
  }

  return relativeOutputPath;
}
