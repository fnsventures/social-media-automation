#!/usr/bin/env node
/**
 * One-time X (Twitter) setup via OAuth 1.0a.
 *
 * Prerequisites (developer.x.com):
 * 1. Create a project + app with Read and Write permissions
 * 2. User authentication settings → OAuth 1.0a → enable
 * 3. Callback URL: http://localhost:8767/callback
 * 4. Add TWITTER_API_KEY and TWITTER_API_SECRET to .env (Keys and tokens tab)
 *
 * Run: npm run setup:twitter
 */
import http from "node:http";
import { execSync } from "node:child_process";
import { TwitterApi } from "twitter-api-v2";
import { loadEnvFile, upsertEnvValue } from "./lib/load-env.js";

loadEnvFile();

const REDIRECT_URI = "http://localhost:8767/callback";
const PORT = 8767;

function readEnv(name) {
  return (process.env[name] ?? "").trim();
}

function looksLikeOAuth2ClientId(value) {
  if (!value || value.length < 20) return false;
  if (value.includes(".apps.googleusercontent.com")) return false;
  try {
    const decoded = Buffer.from(value, "base64").toString("utf8");
    return decoded.includes(":");
  } catch {
    return false;
  }
}

function validateConsumerKeys(appKey, appSecret) {
  if (looksLikeOAuth2ClientId(appKey)) {
    throw new Error(
      "TWITTER_API_KEY looks like an OAuth 2.0 Client ID, not an OAuth 1.0a API Key.\n" +
        "In developer.x.com → your app → Keys and tokens, use:\n" +
        "  Consumer Keys → API Key and API Key Secret\n" +
        "NOT OAuth 2.0 Client ID and Client Secret."
    );
  }
  if (!appKey || !appSecret) {
    throw new Error(
      "Set TWITTER_API_KEY and TWITTER_API_SECRET in .env first.\n" +
        "Get Consumer Keys from https://developer.x.com/ → your app → Keys and tokens."
    );
  }
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

async function waitForCallback() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      if (!req.url?.startsWith("/callback")) {
        res.writeHead(404);
        res.end();
        return;
      }

      const url = new URL(req.url, REDIRECT_URI);
      const denied = url.searchParams.get("denied");
      const oauthToken = url.searchParams.get("oauth_token");
      const oauthVerifier = url.searchParams.get("oauth_verifier");

      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(
        "<h2>X authorization complete.</h2><p>You can close this tab and return to the terminal.</p>"
      );
      server.close();

      if (denied) reject(new Error("Authorization denied."));
      else if (oauthToken && oauthVerifier) resolve({ oauthToken, oauthVerifier });
      else reject(new Error("Missing oauth_verifier in callback."));
    });

    server.listen(PORT, () => {
      console.log(`Waiting for redirect on ${REDIRECT_URI} ...\n`);
    });

    server.on("error", reject);
  }).catch(async () => {
    console.log("Browser redirect failed. Paste values from the callback URL.");
    const oauthToken = await ask("oauth_token: ");
    const oauthVerifier = await ask("oauth_verifier: ");
    return { oauthToken, oauthVerifier };
  });
}

async function main() {
  const appKey = readEnv("TWITTER_API_KEY");
  const appSecret = readEnv("TWITTER_API_SECRET");

  validateConsumerKeys(appKey, appSecret);

  console.log("X (Twitter) setup\n");
  console.log(
    "App settings must include OAuth 1.0a with callback:\n" +
      `  ${REDIRECT_URI}\n`
  );

  const client = new TwitterApi({ appKey, appSecret });
  const authLink = await client.generateAuthLink(REDIRECT_URI);

  console.log("Opening X authorization in your browser...\n");
  console.log("If it does not open, visit:\n");
  console.log(authLink.url);
  console.log("");

  openBrowser(authLink.url);

  const { oauthToken, oauthVerifier } = await waitForCallback();

  if (oauthToken !== authLink.oauth_token) {
    throw new Error("OAuth token mismatch. Run setup again.");
  }

  const loginClient = new TwitterApi({
    appKey,
    appSecret,
    accessToken: authLink.oauth_token,
    accessSecret: authLink.oauth_token_secret,
  });

  const { accessToken, accessSecret, screenName } =
    await loginClient.login(oauthVerifier);

  upsertEnvValue("TWITTER_API_KEY", appKey);
  upsertEnvValue("TWITTER_API_SECRET", appSecret);
  upsertEnvValue("TWITTER_ACCESS_TOKEN", accessToken);
  upsertEnvValue("TWITTER_ACCESS_TOKEN_SECRET", accessSecret);

  console.log("\nSaved to .env for @", screenName);
  console.log("\nAdd these GitHub Secrets:\n");
  console.log("  TWITTER_API_KEY");
  console.log("  TWITTER_API_SECRET");
  console.log("  TWITTER_ACCESS_TOKEN");
  console.log("  TWITTER_ACCESS_TOKEN_SECRET");
  console.log("\nVerify locally:\n  npm run verify\n");
}

main().catch((error) => {
  console.error("\nSetup failed:", error.message);
  process.exit(1);
});
