#!/usr/bin/env node
/**
 * One-time Meta setup: OAuth → long-lived Page token → Page ID → Instagram ID.
 *
 * Prerequisites (developers.facebook.com — ~5 minutes):
 * 1. Create a Business app
 * 2. Use cases → "Manage everything on your Page" → Customize → Permissions:
 *    Add pages_show_list, pages_manage_posts, pages_read_engagement (Ready for testing)
 * 3. Use cases → "Manage messaging & content on Instagram" → Customize → Permissions:
 *    Add instagram_basic, instagram_content_publish (Ready for testing)
 * 4. Add product: Facebook Login → Settings → Valid OAuth Redirect URIs:
 *    http://localhost:8766/oauth/callback
 * 5. App settings → Basic → set Category → Save
 * 6. Add META_APP_ID and META_APP_SECRET to .env
 * 7. Instagram must be Business/Creator and linked to your Facebook Page
 *
 * Run: npm run setup:meta
 */
import http from "node:http";
import { execSync } from "node:child_process";
import { loadEnvFile, upsertEnvValue } from "./lib/load-env.js";

loadEnvFile();
const GRAPH = "https://graph.facebook.com/v21.0";
const REDIRECT_URI = "http://localhost:8766/oauth/callback";
const PORT = 8766;

const SCOPES = [
  "pages_manage_posts",
  "pages_read_engagement",
  "pages_show_list",
  "instagram_basic",
  "instagram_content_publish",
  "business_management",
].join(",");

function readEnv(name) {
  return (process.env[name] ?? "").trim();
}

function ask(question) {
  process.stdout.write(question);
  return new Promise((resolve) => {
    process.stdin.once("data", (data) => resolve(data.toString().trim()));
  });
}

async function graphGet(pathname, params = {}) {
  const url = new URL(`${GRAPH}${pathname}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  const response = await fetch(url);
  const data = await response.json();
  if (!response.ok || data.error) {
    throw new Error(data.error?.message ?? `Graph API error: ${pathname}`);
  }
  return data;
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

async function waitForOAuthCode(appId) {
  const authUrl =
    `https://www.facebook.com/v21.0/dialog/oauth?` +
    `client_id=${encodeURIComponent(appId)}` +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
    `&scope=${encodeURIComponent(SCOPES)}` +
    `&response_type=code`;

  console.log("\nOpening Facebook login in your browser...\n");
  console.log("If it does not open, visit:\n");
  console.log(authUrl);
  console.log("");

  openBrowser(authUrl);

  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      if (!req.url?.startsWith("/oauth/callback")) {
        res.writeHead(404);
        res.end();
        return;
      }

      const url = new URL(req.url, REDIRECT_URI);
      const error = url.searchParams.get("error_description");
      const code = url.searchParams.get("code");

      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(
        "<h2>Meta authorization complete.</h2><p>You can close this tab and return to the terminal.</p>"
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
    console.log("Browser redirect failed. Paste the code from the redirect URL.");
    return ask("Authorization code: ");
  });
}

async function exchangeCodeForToken(appId, appSecret, code) {
  return graphGet("/oauth/access_token", {
    client_id: appId,
    redirect_uri: REDIRECT_URI,
    client_secret: appSecret,
    code,
  });
}

async function exchangeForLongLivedUserToken(appId, appSecret, shortLivedToken) {
  return graphGet("/oauth/access_token", {
    grant_type: "fb_exchange_token",
    client_id: appId,
    client_secret: appSecret,
    fb_exchange_token: shortLivedToken,
  });
}

async function main() {
  const appId = readEnv("META_APP_ID");
  const appSecret = readEnv("META_APP_SECRET");

  if (!appId || !appSecret) {
    throw new Error(
      "Set META_APP_ID and META_APP_SECRET in .env first.\n" +
        "Create an app at https://developers.facebook.com/ and copy App ID + App Secret from Settings → Basic."
    );
  }

  console.log("Meta setup — Facebook + Instagram\n");
  console.log("You will log in with Facebook and approve permissions for your Page.\n");
  console.log(
    "If Facebook shows 'Invalid Scopes', enable permissions in Meta Dashboard first:\n" +
      "  Use cases → Manage everything on your Page → Customize → add Page permissions\n" +
      "  Use cases → Manage messaging & content on Instagram → Customize → add IG permissions\n" +
      "  Each permission must show 'Ready for testing'. Then run this script again.\n"
  );

  const code = await waitForOAuthCode(appId);
  const shortLived = await exchangeCodeForToken(appId, appSecret, code);
  const longLived = await exchangeForLongLivedUserToken(
    appId,
    appSecret,
    shortLived.access_token
  );

  const accounts = await graphGet("/me/accounts", {
    access_token: longLived.access_token,
  });

  const pages = accounts.data ?? [];
  if (pages.length === 0) {
    throw new Error(
      "No Facebook Pages found for this account.\n" +
        "Make sure you are an Admin of a Business Page, then try again."
    );
  }

  let page = pages[0];
  if (pages.length > 1) {
    console.log("Multiple Pages found:\n");
    pages.forEach((entry, index) => {
      console.log(`  ${index + 1}. ${entry.name} (${entry.id})`);
    });
    const choice = await ask("\nEnter the number of the Page to use: ");
    const index = Number.parseInt(choice, 10) - 1;
    if (Number.isNaN(index) || !pages[index]) {
      throw new Error("Invalid Page selection.");
    }
    page = pages[index];
  }

  const pageInfo = await graphGet(`/${page.id}`, {
    fields: "name,instagram_business_account",
    access_token: page.access_token,
  });

  const instagramId = pageInfo.instagram_business_account?.id ?? "";

  upsertEnvValue("META_PAGE_ACCESS_TOKEN", page.access_token);
  upsertEnvValue("META_PAGE_ID", page.id);
  upsertEnvValue("INSTAGRAM_BUSINESS_ACCOUNT_ID", instagramId);

  console.log("\nSaved to .env:\n");
  console.log(`  Page: ${pageInfo.name} (${page.id})`);
  console.log(`  META_PAGE_ID=${page.id}`);
  console.log(`  META_PAGE_ACCESS_TOKEN=${page.access_token.slice(0, 12)}...`);
  if (instagramId) {
    console.log(`  INSTAGRAM_BUSINESS_ACCOUNT_ID=${instagramId}`);
  } else {
    console.log("\n  WARNING: No Instagram Business account linked to this Page.");
    console.log("  Link Instagram to your Page, then run npm run setup:meta again.");
  }

  console.log("\nAdd these GitHub Secrets (Settings → Secrets → Actions):\n");
  console.log(`  META_PAGE_ACCESS_TOKEN`);
  console.log(`  META_PAGE_ID`);
  if (instagramId) console.log(`  INSTAGRAM_BUSINESS_ACCOUNT_ID`);

  console.log("\nVerify locally:\n  npm run verify\n");
}

main().catch((error) => {
  console.error("\nSetup failed:", error.message);
  process.exit(1);
});
