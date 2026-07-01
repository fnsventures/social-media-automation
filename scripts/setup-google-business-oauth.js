#!/usr/bin/env node
/**
 * One-time Google Business Profile setup: OAuth → refresh token + location saved to .env.
 *
 * Prerequisites (console.cloud.google.com):
 * 1. Request Business Profile API access (see README)
 * 2. Enable: My Business Account Management API, My Business Business Information API,
 *    and Google My Business API
 * 3. OAuth consent screen → add scope https://www.googleapis.com/auth/business.manage
 * 4. Create OAuth 2.0 Client (Web or Desktop) with redirect:
 *    http://localhost:8767/oauth2callback
 * 5. Add GOOGLE_BUSINESS_CLIENT_ID and GOOGLE_BUSINESS_CLIENT_SECRET to .env
 *    (or reuse YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET from the same Google project)
 *
 * Run: npm run setup:google-business
 */
import http from "node:http";
import { execSync } from "node:child_process";
import { google } from "googleapis";
import { loadEnvFile, upsertEnvValue } from "./lib/load-env.js";

loadEnvFile();

const REDIRECT_URI = "http://localhost:8767/oauth2callback";
const PORT = 8767;
const SCOPES = ["https://www.googleapis.com/auth/business.manage"];

function readEnv(name) {
  return (process.env[name] ?? "").trim();
}

function readClientCredentials() {
  const clientId =
    readEnv("GOOGLE_BUSINESS_CLIENT_ID") || readEnv("YOUTUBE_CLIENT_ID");
  const clientSecret =
    readEnv("GOOGLE_BUSINESS_CLIENT_SECRET") || readEnv("YOUTUBE_CLIENT_SECRET");

  if (!clientId || !clientSecret) {
    throw new Error(
      "Set GOOGLE_BUSINESS_CLIENT_ID and GOOGLE_BUSINESS_CLIENT_SECRET in .env first.\n" +
        "You can reuse YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET from the same Google Cloud project.\n" +
        "Create OAuth credentials at https://console.cloud.google.com/apis/credentials"
    );
  }

  return { clientId, clientSecret };
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
        "<h2>Google Business authorization complete.</h2><p>You can close this tab and return to the terminal.</p>"
      );
      server.close();

      if (error) {
        const hint =
          error === "access_denied"
            ? " Add your Google account under OAuth → Audience → Test users, then try again."
            : "";
        reject(new Error(`${error}${hint}`));
      }
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

async function listAccounts(auth) {
  const response = await auth.request({
    url: "https://mybusinessaccountmanagement.googleapis.com/v1/accounts",
  });
  return response.data?.accounts ?? [];
}

async function listLocations(auth, accountName) {
  const accountId = accountName.replace(/^accounts\//, "");
  const response = await auth.request({
    url: `https://mybusinessbusinessinformation.googleapis.com/v1/accounts/${accountId}/locations`,
    params: { readMask: "name,title,storefrontAddress" },
  });
  return response.data?.locations ?? [];
}

function formatLocation(location) {
  const title = location.title ?? "(untitled)";
  const address = location.storefrontAddress;
  const city = address?.locality;
  const region = address?.administrativeArea;
  const suffix = [city, region].filter(Boolean).join(", ");
  return suffix ? `${title} — ${suffix}` : title;
}

function suggestMediaBaseUrl() {
  try {
    const remote = execSync("git config --get remote.origin.url", {
      encoding: "utf8",
    }).trim();
    const match = remote.match(/github\.com[:/](.+?)(?:\.git)?$/);
    if (!match) return "";

    const [owner, repo] = match[1].split("/");
    let branch = "master";
    try {
      branch = execSync("git rev-parse --abbrev-ref HEAD", {
        encoding: "utf8",
      }).trim();
    } catch {
      // keep default branch
    }
    return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}`;
  } catch {
    return "";
  }
}

async function chooseLocation(auth) {
  const accounts = await listAccounts(auth);
  if (accounts.length === 0) {
    throw new Error(
      "No Google Business accounts found. Confirm API access is approved and you signed in as a profile owner/manager."
    );
  }

  let account = accounts[0];
  if (accounts.length > 1) {
    console.log("\nGoogle Business accounts:\n");
    accounts.forEach((entry, index) => {
      console.log(`  ${index + 1}. ${entry.accountName ?? entry.name}`);
    });
    const pick = Number(await ask("\nSelect account number: "));
    account = accounts[pick - 1];
    if (!account) throw new Error("Invalid account selection.");
  }

  const locations = await listLocations(auth, account.name);
  if (locations.length === 0) {
    throw new Error(`No locations found under ${account.name}.`);
  }

  let location = locations[0];
  if (locations.length > 1) {
    console.log("\nLocations:\n");
    locations.forEach((entry, index) => {
      console.log(`  ${index + 1}. ${formatLocation(entry)}`);
      console.log(`     ${entry.name}`);
    });
    const pick = Number(await ask("\nSelect location number: "));
    location = locations[pick - 1];
    if (!location) throw new Error("Invalid location selection.");
  } else {
    console.log(`\nUsing location: ${formatLocation(location)}`);
    console.log(`  ${location.name}`);
  }

  return `${account.name}/${location.name}`;
}

async function main() {
  const { clientId, clientSecret } = readClientCredentials();

  console.log("Google Business Profile setup\n");
  console.log(
    "Sign in with the Google account that manages your Business Profile listing.\n"
  );
  console.log(
    "Note: Google must approve Business Profile API access before posts will work.\n"
  );

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
  let tokens;
  try {
    ({ tokens } = await oauth2.getToken(code));
  } catch (error) {
    const message = error.message ?? "";
    if (message.includes("invalid_client")) {
      throw new Error(
        "invalid_client — the Client Secret in .env does not match the Client ID.\n" +
          "In Cloud Console → Clients → open your OAuth client → copy a fresh Client secret.\n" +
          "Client ID and secret must be from the same OAuth client in project bishnupriya-fuels-social."
      );
    }
    throw error;
  }

  if (!tokens.refresh_token) {
    throw new Error(
      "No refresh token returned. Revoke prior access at https://myaccount.google.com/permissions " +
        "and run setup again."
    );
  }

  oauth2.setCredentials({ refresh_token: tokens.refresh_token });

  const locationName = await chooseLocation(oauth2);
  const suggestedBase = suggestMediaBaseUrl();

  upsertEnvValue("GOOGLE_BUSINESS_CLIENT_ID", clientId);
  upsertEnvValue("GOOGLE_BUSINESS_CLIENT_SECRET", clientSecret);
  upsertEnvValue("GOOGLE_BUSINESS_REFRESH_TOKEN", tokens.refresh_token);
  upsertEnvValue("GOOGLE_BUSINESS_LOCATION_NAME", locationName);

  if (suggestedBase) {
    upsertEnvValue("GOOGLE_BUSINESS_MEDIA_BASE_URL", suggestedBase);
  }

  console.log("\nSaved to .env:");
  console.log(`  GOOGLE_BUSINESS_REFRESH_TOKEN=${tokens.refresh_token.slice(0, 12)}...`);
  console.log(`  GOOGLE_BUSINESS_LOCATION_NAME=${locationName}`);
  if (suggestedBase) {
    console.log(`  GOOGLE_BUSINESS_MEDIA_BASE_URL=${suggestedBase}`);
  }

  console.log("\nAdd these GitHub Secrets:\n");
  console.log("  GOOGLE_BUSINESS_CLIENT_ID");
  console.log("  GOOGLE_BUSINESS_CLIENT_SECRET");
  console.log("  GOOGLE_BUSINESS_REFRESH_TOKEN");
  console.log("  GOOGLE_BUSINESS_LOCATION_NAME");
  console.log("  GOOGLE_BUSINESS_MEDIA_BASE_URL");
  console.log("\nVerify locally:\n  npm run verify\n");
  console.log(
    "Important: media files must be publicly reachable at GOOGLE_BUSINESS_MEDIA_BASE_URL/media/... " +
      "before Google can attach them to a post. In GitHub Actions this usually means the image is " +
      "already committed and pushed to the branch used in the base URL.\n"
  );
}

main().catch((error) => {
  console.error("\nSetup failed:", error.message);
  process.exit(1);
});
