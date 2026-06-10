#!/usr/bin/env node
/**
 * One-time YouTube setup: OAuth → refresh token saved to .env.
 *
 * Prerequisites (console.cloud.google.com):
 * 1. Create a project and enable YouTube Data API v3
 * 2. OAuth consent screen → External → add scope youtube.upload
 * 3. Credentials → OAuth 2.0 Client → Desktop app (or Web with redirect below)
 * 4. Add YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET to .env
 * 5. If Web client, authorized redirect URI:
 *    http://localhost:8765/oauth2callback
 *
 * Run: npm run setup:youtube
 */
import http from "node:http";
import { execSync } from "node:child_process";
import { google } from "googleapis";
import { loadEnvFile, upsertEnvValue } from "./lib/load-env.js";

loadEnvFile();

const REDIRECT_URI = "http://localhost:8765/oauth2callback";
const PORT = 8765;
const SCOPES = ["https://www.googleapis.com/auth/youtube.upload"];

function readEnv(name) {
  return (process.env[name] ?? "").trim();
}

function ask(question) {
  process.stdout.write(question);
  return new Promise((resolve) => {
    process.stdin.once("data", (data) => resolve(data.toString().trim()));
  });
}

function openBrowser(url) {
  const platform = process.platform;
  try {
    if (platform === "darwin") execSync(`open "${url}"`, { stdio: "ignore" });
    else if (platform === "win32") execSync(`start "" "${url}"`, { stdio: "ignore" });
    else execSync(`xdg-open "${url}"`, { stdio: "ignore" });
  } catch {
    console.log("Could not open browser automatically. Copy the URL below.");
  }
}

async function waitForAuthCode() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      if (!req.url?.startsWith("/oauth2callback")) {
        res.writeHead(404);
        res.end();
        return;
      }

      const url = new URL(req.url, REDIRECT_URI);
      const error = url.searchParams.get("error");
      const code = url.searchParams.get("code");

      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(
        "<h2>YouTube authorization complete.</h2><p>You can close this tab and return to the terminal.</p>"
      );
      server.close();

      if (error) reject(new Error(error));
      else if (code) resolve(code);
      else reject(new Error("No authorization code received."));
    });

    server.listen(PORT, () => {
      console.log(`Waiting for redirect on ${REDIRECT_URI} ...\n`);
    });

    server.on("error", reject);
  }).catch(async () => {
    console.log("Browser redirect failed. Paste the authorization code manually.");
    return ask("Authorization code: ");
  });
}

async function main() {
  const clientId = readEnv("YOUTUBE_CLIENT_ID");
  const clientSecret = readEnv("YOUTUBE_CLIENT_SECRET");

  if (!clientId || !clientSecret) {
    throw new Error(
      "Set YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET in .env first.\n" +
        "Create OAuth credentials at https://console.cloud.google.com/apis/credentials"
    );
  }

  console.log("YouTube setup\n");
  console.log("Sign in with the Google account that owns your YouTube channel.\n");

  const oauth2 = new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI);
  const authUrl = oauth2.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
  });

  console.log("Opening Google authorization in your browser...\n");
  console.log("If it does not open, visit:\n");
  console.log(authUrl);
  console.log("");

  openBrowser(authUrl);

  const code = await waitForAuthCode();
  const { tokens } = await oauth2.getToken(code);

  if (!tokens.refresh_token) {
    throw new Error(
      "No refresh token returned. Revoke prior access at https://myaccount.google.com/permissions " +
        "and run setup again."
    );
  }

  upsertEnvValue("YOUTUBE_CLIENT_ID", clientId);
  upsertEnvValue("YOUTUBE_CLIENT_SECRET", clientSecret);
  upsertEnvValue("YOUTUBE_REFRESH_TOKEN", tokens.refresh_token);

  console.log("\nSaved to .env:");
  console.log(`  YOUTUBE_REFRESH_TOKEN=${tokens.refresh_token.slice(0, 12)}...`);
  console.log("\nAdd these GitHub Secrets:\n");
  console.log("  YOUTUBE_CLIENT_ID");
  console.log("  YOUTUBE_CLIENT_SECRET");
  console.log("  YOUTUBE_REFRESH_TOKEN");
  console.log("\nVerify locally:\n  npm run verify\n");
  console.log("Note: YouTube posts require media.video in each YAML post.\n");
}

main().catch((error) => {
  console.error("\nSetup failed:", error.message);
  process.exit(1);
});
