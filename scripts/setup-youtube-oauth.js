#!/usr/bin/env node
/**
 * One-time setup: obtain YouTube refresh token for uploads.
 *
 * 1. Add YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET to .env
 * 2. Run: node scripts/setup-youtube-oauth.js
 * 3. Open the printed URL, authorize, paste the code
 * 4. Save refresh_token to GitHub Secret YOUTUBE_REFRESH_TOKEN
 */
import http from "node:http";
import { google } from "googleapis";
import { config } from "./lib/config.js";

const REDIRECT_URI = "http://localhost:8765/oauth2callback";
const SCOPES = ["https://www.googleapis.com/auth/youtube.upload"];

function ask(question) {
  process.stdout.write(question);
  return new Promise((resolve) => {
    process.stdin.once("data", (data) => resolve(data.toString().trim()));
  });
}

async function main() {
  if (!config.youtube.clientId || !config.youtube.clientSecret) {
    throw new Error("Set YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET in .env first.");
  }

  const oauth2 = new google.auth.OAuth2(
    config.youtube.clientId,
    config.youtube.clientSecret,
    REDIRECT_URI
  );

  const authUrl = oauth2.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
  });

  console.log("\nOpen this URL in your browser:\n");
  console.log(authUrl);
  console.log("\nWaiting for redirect on http://localhost:8765 ...\n");

  const code = await new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      if (!req.url?.startsWith("/oauth2callback")) return;
      const url = new URL(req.url, REDIRECT_URI);
      const authCode = url.searchParams.get("code");
      res.end("Authorization complete. You can close this tab.");
      server.close();
      if (authCode) resolve(authCode);
      else reject(new Error("No code in callback"));
    });
    server.listen(8765);
  }).catch(async () => {
    console.log("If browser redirect failed, paste the code manually.");
    return ask("Authorization code: ");
  });

  const { tokens } = await oauth2.getToken(code);
  console.log("\nAdd this to GitHub Secrets:\n");
  console.log(`YOUTUBE_REFRESH_TOKEN=${tokens.refresh_token}`);
  process.exit(0);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
