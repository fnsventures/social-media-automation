import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  printCopyBlock,
  printGitHubSecretsReminder,
  printHeading,
  printStep,
} from "./setup-ui.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");

export const GITHUB_SECRETS_URL =
  "https://github.com/fnsventures/social-media-automation/settings/secrets/actions";

export const GOOGLE_BUSINESS_SECRETS = [
  "GOOGLE_BUSINESS_CLIENT_ID",
  "GOOGLE_BUSINESS_CLIENT_SECRET",
  "GOOGLE_BUSINESS_REFRESH_TOKEN",
  "GOOGLE_BUSINESS_LOCATION_NAME",
  "GOOGLE_BUSINESS_MEDIA_BASE_URL",
];

export const META_SECRETS = [
  "META_PAGE_ACCESS_TOKEN",
  "META_PAGE_ID",
  "INSTAGRAM_BUSINESS_ACCOUNT_ID",
];

export const YOUTUBE_SECRETS = [
  "YOUTUBE_CLIENT_ID",
  "YOUTUBE_CLIENT_SECRET",
  "YOUTUBE_REFRESH_TOKEN",
];

export const YOUTUBE_COMMUNITY_SECRETS = ["YOUTUBE_CHANNEL_ID", "YOUTUBE_COOKIES_JSON"];

export const WHATSAPP_SECRETS = [
  "WHATSAPP_AUTH_B64",
  "WHATSAPP_BUSINESS_NUMBER",
  "WHATSAPP_STATUS_AUDIENCE",
];

/** Recovery metadata for every token used in this project. */
export const PLATFORM_RECOVERY = {
  facebook: {
    id: "meta",
    label: "Meta (Facebook + Instagram)",
    setupCommand: "setup:meta",
    secrets: META_SECRETS,
    docAnchor: "meta-facebook--instagram--page-access-token-expired-or-invalid",
  },
  instagram: {
    id: "meta",
    label: "Meta (Facebook + Instagram)",
    setupCommand: "setup:meta",
    secrets: META_SECRETS,
    docAnchor: "meta-facebook--instagram--page-access-token-expired-or-invalid",
  },
  youtube: {
    id: "youtube",
    label: "YouTube",
    setupCommand: "setup:youtube",
    secrets: YOUTUBE_SECRETS,
    docAnchor: "youtube-oauth--refresh-token-invalid",
  },
  whatsapp: {
    id: "whatsapp",
    label: "WhatsApp Status",
    setupCommand: "setup:whatsapp",
    secrets: WHATSAPP_SECRETS,
    extraSteps: ["npm run export:whatsapp-auth", "Copy WHATSAPP_AUTH_B64 to GitHub Secrets"],
    docAnchor: "whatsapp-status--session-expired-or-logged-out",
  },
  google_business: {
    id: "google_business",
    label: "Google Business Profile",
    setupCommand: "setup:google-business",
    secrets: GOOGLE_BUSINESS_SECRETS,
    docAnchor: "google-business-profile--refresh-token-invalid-or-api-access-issue",
  },
};

function messageFromError(error) {
  if (!error) return "";
  if (typeof error === "string") return error;
  return (
    error.message ??
    error.response?.data?.error?.message ??
    error.response?.data?.error?.errors?.[0]?.message ??
    String(error)
  );
}

export function isGoogleBusinessTokenError(error) {
  const message = messageFromError(error);
  return /invalid_grant|invalid_token|unauthorized|token has been expired|token has been revoked|access.?token/i.test(
    message
  );
}

export function isGoogleBusinessApiDisabledError(error) {
  const message = messageFromError(error);
  return /has not been used|is disabled|SERVICE_DISABLED/i.test(message);
}

export function isMetaTokenError(error) {
  const message = messageFromError(error);
  return (
    /Error validating access token|session has been invalidated|OAuthException|code.?190|expired|Facebook Page token invalid|Meta verification failed/i.test(
      message
    ) || /Facebook API error|Instagram API error/i.test(message)
  );
}

export function isYoutubeTokenError(error) {
  const message = messageFromError(error);
  return (
    /invalid_grant|invalid_token|token has been expired|token has been revoked|insufficient.*scope|insufficientPermissions|YouTube verification failed/i.test(
      message
    )
  );
}

export function isWhatsAppSessionError(error) {
  const message = messageFromError(error);
  return (
    /WhatsApp auth|session|logged out|connection closed|QR|WHATSAPP_AUTH|not configured|invalid/i.test(
      message
    )
  );
}

export function classifyPlatformFailure(platform, error) {
  const message = messageFromError(error);
  if (platform === "google_business") {
    if (isGoogleBusinessApiDisabledError(error)) {
      return { platform, apiDisabled: true, message };
    }
    if (isGoogleBusinessTokenError(error) || /Google Business credentials missing/i.test(message)) {
      return { platform, apiDisabled: false, message };
    }
  }
  if (platform === "facebook" || platform === "instagram") {
    if (isMetaTokenError(error)) return { platform: "meta", message };
  }
  if (platform === "youtube" && isYoutubeTokenError(error)) {
    return { platform: "youtube", message };
  }
  if (platform === "whatsapp" && isWhatsAppSessionError(error)) {
    return { platform: "whatsapp", message };
  }
  return { platform, message };
}

export function getRecoveryForPlatform(platform) {
  if (platform === "meta") return PLATFORM_RECOVERY.facebook;
  return PLATFORM_RECOVERY[platform];
}

export function runNpmSetup(scriptName) {
  printHeading(`Running npm run ${scriptName}`);
  const result = spawnSync("npm", ["run", scriptName], {
    cwd: ROOT,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  return result.status === 0;
}

export function printGitHubPatRecovery() {
  printHeading("Fix GitHub Personal Access Token (Social Studio)");
  console.log("  Used only in the browser — not stored in GitHub Secrets.\n");
  printStep(1, "Create a new token: https://github.com/settings/tokens");
  printStep(2, "Scopes: repo (or Contents read/write) + workflow (or Actions read/write)");
  printStep(3, "Open Social Studio → GitHub connection → paste token → Save settings");
  printCopyBlock("Social Studio", ["https://fnsventures.github.io/social-media-automation/"]);
}

export function printYoutubeRecovery() {
  printHeading("Fix YouTube credentials");
  console.log("  Your YouTube OAuth refresh token is missing or expired.\n");
  printStep(1, "Run:");
  printCopyBlock("Terminal", ["npm run setup:youtube"]);
  printStep(2, "Sign in with the Google account that owns your YouTube channel.");
  printStep(3, "Copy these from `.env` to GitHub Secrets:");
  printGitHubSecretsReminder(YOUTUBE_SECRETS);
  printStep(4, "For YouTube Community image posts (optional), also run:");
  printCopyBlock("Terminal", ["npm run setup:youtube-cookies"]);
  printStep(5, "Update GitHub Secrets: YOUTUBE_CHANNEL_ID, YOUTUBE_COOKIES_JSON");
  printStep(6, "Verify:");
  printCopyBlock("Terminal", ["npm run verify"]);
}

export function printWhatsAppRecovery() {
  printHeading("Fix WhatsApp Status session");
  console.log("  Your WhatsApp linked-device session is missing or expired.\n");
  printStep(1, "On the business phone (+91 96689 13299), ensure WhatsApp is online.");
  printStep(2, "Run:");
  printCopyBlock("Terminal", ["npm run setup:whatsapp"]);
  printStep(3, "Scan the QR code or enter the pairing code on that phone.");
  printStep(4, "Export session for GitHub Actions:");
  printCopyBlock("Terminal", ["npm run export:whatsapp-auth"]);
  printStep(5, "Copy WHATSAPP_AUTH_B64 to GitHub Secrets:");
  printGitHubSecretsReminder(["WHATSAPP_AUTH_B64"]);
  printStep(6, "Verify:");
  printCopyBlock("Terminal", ["npm run verify"]);
}

export function printGoogleBusinessRecovery({ apiDisabled = false } = {}) {
  printHeading("Fix Google Business credentials");
  if (apiDisabled) {
    console.log("  Google Cloud APIs are disabled for posting or business info.\n");
    printStep(1, "Enable all three APIs in Google Cloud Console:");
    console.log("     • Google My Business API");
    console.log("     • My Business Account Management API");
    console.log("     • My Business Business Information API");
    printStep(2, "Wait 2–5 minutes, then continue below.");
  } else {
    console.log("  Your Google Business refresh token is missing or expired.\n");
  }
  printStep(apiDisabled ? 3 : 1, "Run:");
  printCopyBlock("Terminal", ["npm run setup:google-business"]);
  printStep(apiDisabled ? 4 : 2, "Sign in with the Google account that manages your listing.");
  printStep(apiDisabled ? 5 : 3, "Select your business location when prompted.");
  printStep(apiDisabled ? 6 : 4, "Copy these from `.env` to GitHub Secrets:");
  printGitHubSecretsReminder(GOOGLE_BUSINESS_SECRETS);
  printStep(apiDisabled ? 7 : 5, "Verify:");
  printCopyBlock("Terminal", ["npm run verify"]);
}

export function printMetaRecovery() {
  printHeading("Fix Meta (Facebook + Instagram) credentials");
  console.log("  Your Meta Page access token is missing or expired.\n");
  printStep(1, "Run:");
  printCopyBlock("Terminal", ["npm run setup:meta"]);
  printStep(2, "Log in to Facebook and approve access for your Page and Instagram.");
  printStep(3, "Copy these from `.env` to GitHub Secrets:");
  printGitHubSecretsReminder(META_SECRETS);
  printStep(4, "Verify:");
  printCopyBlock("Terminal", ["npm run verify"]);
  console.log(
    "  For Google Business social links only (no Meta token): set GOOGLE_BUSINESS_FACEBOOK_URL and\n" +
      "  GOOGLE_BUSINESS_INSTAGRAM_URL in .env, then npm run setup:google-business-social\n"
  );
}

export function printRecoveryForPlatform(platform, options = {}) {
  const recoveryId = platform === "facebook" || platform === "instagram" ? "meta" : platform;
  switch (recoveryId) {
    case "meta":
      printMetaRecovery();
      break;
    case "youtube":
      printYoutubeRecovery();
      break;
    case "whatsapp":
      printWhatsAppRecovery();
      break;
    case "google_business":
      printGoogleBusinessRecovery(options);
      break;
    default:
      console.log(`  No automated recovery guide for: ${platform}\n`);
  }
}

export function printRecoverySummary(failedPlatforms, errors = {}) {
  if (!failedPlatforms.length) return;

  printHeading("How to fix failed credentials");
  const seen = new Set();

  for (const platform of failedPlatforms) {
    const recovery = getRecoveryForPlatform(platform);
    const recoveryId = recovery?.id ?? platform;
    if (seen.has(recoveryId)) continue;
    seen.add(recoveryId);

    const err = errors[platform];
    if (err) console.log(`  ${recovery?.label ?? platform}: ${messageFromError(err)}\n`);

    if (recoveryId === "google_business") {
      const classified = classifyPlatformFailure("google_business", err);
      printGoogleBusinessRecovery({ apiDisabled: classified.apiDisabled });
    } else {
      printRecoveryForPlatform(recoveryId);
    }
  }

  console.log("  Full guide: docs/MEDIA_UPLOAD_GUIDE.md#credential-renewal-overview");
  console.log(`  GitHub Secrets: ${GITHUB_SECRETS_URL}\n`);
}

export async function offerPlatformFix(platform, { fix, askYesNo }) {
  const recovery = getRecoveryForPlatform(platform);
  if (!recovery?.setupCommand) return false;

  const label = recovery.label ?? platform;

  if (!fix) {
    printRecoveryForPlatform(platform === "meta" ? "meta" : recovery.id ?? platform);
    return false;
  }

  const run = await askYesNo(`Run npm run ${recovery.setupCommand} now to refresh ${label}?`);
  if (!run) {
    printRecoveryForPlatform(platform === "meta" ? "meta" : recovery.id ?? platform);
    return false;
  }

  const ok = runNpmSetup(recovery.setupCommand);
  if (!ok) {
    console.error(`\n${label} setup did not complete. Follow the manual steps above.\n`);
    return false;
  }

  if (recovery.id === "whatsapp") {
    const exportOk = await askYesNo("Run npm run export:whatsapp-auth for GitHub Actions?");
    if (exportOk) runNpmSetup("export:whatsapp-auth");
    console.log("\nCopy WHATSAPP_AUTH_B64 from the output to GitHub Secrets.\n");
  }

  console.log(`\n${label} credentials refreshed. Run npm run verify to confirm.\n`);
  return true;
}

export async function offerGoogleBusinessFix({ fix, askYesNo }) {
  return offerPlatformFix("google_business", { fix, askYesNo });
}

export async function offerMetaFix({ fix, askYesNo, ask }) {
  if (!fix) {
    printMetaRecovery();
    return null;
  }

  const choice = await ask(
    "Meta token failed. Choose: [1] Run setup:meta  [2] Paste Facebook/Instagram URLs manually  [3] Skip",
    { defaultValue: "1" }
  );

  if (choice === "1") {
    const ok = runNpmSetup("setup:meta");
    if (!ok) {
      printMetaRecovery();
      return null;
    }
    return "refreshed";
  }

  if (choice === "2") {
    const facebook = await ask("Facebook Page URL (https://www.facebook.com/...)");
    const instagram = await ask("Instagram URL (https://www.instagram.com/...)");
    return { facebook, instagram };
  }

  printMetaRecovery();
  return null;
}

export function wrapSetupError(error, context = "Setup") {
  const message = messageFromError(error);
  if (isGoogleBusinessTokenError(error) || /Google Business credentials missing/i.test(message)) {
    return { type: "google_business", message, apiDisabled: false };
  }
  if (isGoogleBusinessApiDisabledError(error)) {
    return { type: "google_business", message, apiDisabled: true };
  }
  if (isMetaTokenError(error)) {
    return { type: "meta", message };
  }
  if (isYoutubeTokenError(error)) {
    return { type: "youtube", message };
  }
  if (isWhatsAppSessionError(error)) {
    return { type: "whatsapp", message };
  }
  return { type: "unknown", message: `${context} failed: ${message}` };
}
