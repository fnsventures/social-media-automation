import {
  GITHUB_SECRETS_URL,
  PLATFORM_RECOVERY,
  classifyPlatformFailure,
  getRecoveryForPlatform,
} from "./credential-recovery.js";

const PLATFORM_LABELS = {
  facebook: "Facebook",
  instagram: "Instagram",
  youtube: "YouTube",
  whatsapp: "WhatsApp Status",
  google_business: "Google Business",
};

function messageFromError(error) {
  if (!error) return "";
  if (typeof error === "string") return error;
  return error.message ?? String(error);
}

export function buildCredentialReport({
  results,
  messages = {},
  errors = {},
  failed = [],
  socialLinks = [],
  warnings = [],
}) {
  const platforms = {};
  for (const [name, status] of Object.entries(results)) {
    platforms[name] = {
      status,
      label: PLATFORM_LABELS[name] ?? name,
      message: messages[name] ?? "",
      error: messageFromError(errors[name]),
    };
  }

  const seen = new Set();
  const recovery = [];
  for (const platform of failed) {
    const meta = getRecoveryForPlatform(platform);
    const id = meta?.id ?? platform;
    if (seen.has(id)) continue;
    seen.add(id);

    const classified =
      id === "google_business" ? classifyPlatformFailure("google_business", errors[platform]) : null;

    recovery.push({
      id,
      platforms: failed.filter((name) => (getRecoveryForPlatform(name)?.id ?? name) === id),
      label: meta?.label ?? PLATFORM_LABELS[platform] ?? platform,
      setupCommand: meta?.setupCommand ?? null,
      setupNpm: meta?.setupCommand ? `npm run ${meta.setupCommand}` : null,
      verifyFixNpm: "npm run verify:fix",
      secrets: meta?.secrets ?? [],
      extraSteps: meta?.extraSteps ?? [],
      error: messageFromError(errors[platform] ?? errors[failed.find((n) => getRecoveryForPlatform(n)?.id === id)]),
      apiDisabled: classified?.apiDisabled ?? false,
      docPath: "docs/CREDENTIAL_RECOVERY.md",
      secretsUrl: GITHUB_SECRETS_URL,
    });
  }

  return {
    checkedAt: new Date().toISOString(),
    ok: failed.length === 0,
    platforms,
    socialLinks,
    warnings,
    recovery,
  };
}

export { PLATFORM_LABELS };
