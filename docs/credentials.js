/**
 * Social Studio — credential health panel.
 * Checks GitHub PAT locally; checks platform secrets via verify-credentials workflow.
 */
(function () {
  const WORKFLOW_VERIFY = "verify-credentials.yml";
  const STORAGE_KEY = "credential-health-last";
  const PLATFORM_ORDER = ["facebook", "instagram", "youtube", "whatsapp", "google_business"];
  const PLATFORM_LABELS = {
    facebook: "Facebook",
    instagram: "Instagram",
    youtube: "YouTube",
    whatsapp: "WhatsApp Status",
    google_business: "Google Business",
  };
  const PLATFORM_ICONS = {
    github: "⬡",
    facebook: "f",
    instagram: "◎",
    youtube: "▶",
    whatsapp: "✆",
    google_business: "📍",
  };
  const STATUS_LABELS = {
    ok: "Connected",
    fail: "Needs fix",
    missing: "Not set up",
  };
  const PROGRESS_STEPS = [
    { id: "github", label: "GitHub token" },
    { id: "dispatch", label: "Start check" },
    { id: "workflow", label: "Run on GitHub" },
    { id: "report", label: "Load results" },
  ];

  let deps = null;

  function secretsUrl(config) {
    return `https://github.com/${config.owner}/${config.repo}/settings/secrets/actions`;
  }

  function actionsUrl(config) {
    return `https://github.com/${config.owner}/${config.repo}/actions/workflows/${WORKFLOW_VERIFY}`;
  }

  function docsUrl(path, branch = "studio") {
    return `https://github.com/fnsventures/social-media-automation/blob/${branch}/${path}`;
  }

  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text ?? "";
    return div.innerHTML;
  }

  function parseApiError(message) {
    const raw = String(message ?? "");
    const jsonMatch = raw.match(/^\d+:\s*(\{[\s\S]*\})$/);
    if (jsonMatch) {
      try {
        const data = JSON.parse(jsonMatch[1]);
        if (data.message) return data.message;
      } catch {
        // fall through
      }
    }
    return raw.replace(/^\d+:\s*/, "");
  }

  function friendlyWorkflowError(message) {
    const text = parseApiError(message);
    if (text.includes("workflow_dispatch") || text.includes("422")) {
      return `Credential check is not available on branch "${deps.getConfig().branch}" yet. Confirm Branch is set to studio in GitHub connection, then try again in a minute.`;
    }
    if (text.includes("404") || text.includes("Not Found")) {
      return "Credential check workflow not found. Set Branch to studio in GitHub connection settings.";
    }
    if (text.includes("artifact not found") || text.includes("credential-health.json")) {
      return "The check ran but no report was produced. Open the workflow run on GitHub — the verify step may have failed.";
    }
    if (text.includes("Timed out")) {
      return "The check is taking longer than expected. Open GitHub Actions to see if it is still running, then try again.";
    }
    return text;
  }

  function formatRelativeTime(isoDate) {
    const then = new Date(isoDate).getTime();
    const diffMs = Date.now() - then;
    const minutes = Math.floor(diffMs / 60000);
    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hr ago`;
    return new Date(isoDate).toLocaleString();
  }

  function saveCachedReport(report, githubUser) {
    try {
      sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ report, githubUser, savedAt: new Date().toISOString() })
      );
    } catch {
      // ignore quota errors
    }
  }

  function loadCachedReport() {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const cached = JSON.parse(raw);
      if (!cached?.report?.checkedAt) return null;
      const ageHours = (Date.now() - new Date(cached.report.checkedAt).getTime()) / 3600000;
      if (ageHours > 24) return null;
      return cached;
    } catch {
      return null;
    }
  }

  function openCredentialsPanel() {
    const panel = document.getElementById("credentials-section");
    if (panel) panel.open = true;
  }

  function setCredentialsStatus(message, type = "", { html = false } = {}) {
    const el = document.getElementById("credentials-status");
    el.classList.remove("hidden");
    if (html) el.innerHTML = message;
    else el.textContent = message;
    el.className = `status${type ? ` ${type}` : ""}`;
  }

  function hideCredentialsStatus() {
    const el = document.getElementById("credentials-status");
    el.classList.add("hidden");
    el.textContent = "";
    el.className = "status hidden";
  }

  function setProgressStep(activeId, detail = "") {
    const root = document.getElementById("credentials-progress");
    if (!root) return;
    root.classList.remove("hidden");
    root.innerHTML = `
      <ol class="credential-steps">
        ${PROGRESS_STEPS.map((step, index) => {
          const activeIndex = PROGRESS_STEPS.findIndex((entry) => entry.id === activeId);
          const state =
            index < activeIndex ? "done" : index === activeIndex ? "active" : "pending";
          return `
            <li class="credential-step ${state}">
              <span class="credential-step-dot" aria-hidden="true"></span>
              <span class="credential-step-label">${escapeHtml(step.label)}</span>
            </li>
          `;
        }).join("")}
      </ol>
      ${detail ? `<p class="credential-progress-detail">${detail}</p>` : ""}
    `;
  }

  function hideProgress() {
    const root = document.getElementById("credentials-progress");
    if (root) {
      root.classList.add("hidden");
      root.innerHTML = "";
    }
  }

  function renderSkeleton() {
    const root = document.getElementById("credentials-results");
    root.innerHTML = `
      <div class="credential-grid credential-grid-loading">
        ${Array.from({ length: 6 })
          .map(
            () => `
          <article class="credential-card skeleton">
            <div class="skeleton-line wide"></div>
            <div class="skeleton-line"></div>
          </article>
        `
          )
          .join("")}
      </div>
    `;
  }

  function countStatuses(report, githubUser) {
    const counts = { ok: 0, fail: 0, missing: 0 };
    if (githubUser) counts.ok += 1;
    else counts.fail += 1;
    for (const name of PLATFORM_ORDER) {
      const status = report.platforms?.[name]?.status || "missing";
      if (status === "ok") counts.ok += 1;
      else if (status === "fail") counts.fail += 1;
      else counts.missing += 1;
    }
    return counts;
  }

  function updateHealthBadge(report, githubUser) {
    const badge = document.getElementById("credentials-health-badge");
    if (!badge) return;
    const counts = countStatuses(report, githubUser);
    badge.classList.remove("hidden", "ok", "warn", "fail");
    if (counts.fail > 0 || !githubUser) {
      badge.textContent = counts.fail > 0 ? `${counts.fail} issue${counts.fail === 1 ? "" : "s"}` : "Token issue";
      badge.classList.add("fail");
    } else if (counts.missing > 0) {
      badge.textContent = `${counts.missing} optional`;
      badge.classList.add("warn");
    } else {
      badge.textContent = "All good";
      badge.classList.add("ok");
    }
  }

  function renderStats(report, githubUser) {
    const root = document.getElementById("credentials-stats");
    if (!root) return;
    const counts = countStatuses(report, githubUser);
    root.classList.remove("hidden");
    root.innerHTML = `
      <span class="credential-stat ok">${counts.ok} connected</span>
      ${counts.fail ? `<span class="credential-stat fail">${counts.fail} need fix</span>` : ""}
      ${counts.missing ? `<span class="credential-stat missing">${counts.missing} not set up</span>` : ""}
    `;
  }

  async function verifyGitHubPat(config) {
    const response = await fetch("https://api.github.com/user", {
      headers: deps.authHeaders(config),
    });
    if (!response.ok) {
      throw new Error("GitHub token is invalid or expired. Create a new token with repo and workflow scopes.");
    }
    const user = await response.json();
    return user.login || "connected";
  }

  async function loadJsZip() {
    if (window.JSZip) return window.JSZip;
    await new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/jszip@3/dist/jszip.min.js";
      script.async = true;
      script.onload = resolve;
      script.onerror = () => reject(new Error("Could not load JSZip."));
      document.head.appendChild(script);
    });
    return window.JSZip;
  }

  async function dispatchVerifyWorkflow(config) {
    await deps.api(
      config,
      `${deps.repoApiBase(config)}/actions/workflows/${WORKFLOW_VERIFY}/dispatches`,
      {
        method: "POST",
        body: JSON.stringify({ ref: config.branch }),
      }
    );
  }

  async function waitForVerifyWorkflow(config, startedAfter, onRunFound) {
    // Workflow exits 1 when credentials fail — still download the report with fix steps.
    return deps.waitForDispatchedRun(
      config,
      WORKFLOW_VERIFY,
      startedAfter,
      onRunFound,
      60,
      "Credential check workflow",
      { allowFailure: true }
    );
  }

  async function downloadCredentialReport(config, runId) {
    const artifacts = await deps.api(
      config,
      `/repos/${config.owner}/${config.repo}/actions/runs/${runId}/artifacts?per_page=10`
    );

    const artifact = artifacts.artifacts?.find((entry) => entry.name === "credential-health");
    if (!artifact) {
      throw new Error("Credential report artifact not found. Is verify-credentials.yml on your branch?");
    }

    const response = await fetch(artifact.archive_download_url, {
      headers: deps.authHeaders(config),
    });
    if (!response.ok) {
      throw new Error(`Could not download credential report (${response.status}).`);
    }

    const buffer = await response.arrayBuffer();
    const JSZip = await loadJsZip();
    const zip = await JSZip.loadAsync(buffer);
    const jsonFile = Object.values(zip.files).find((file) => file.name.endsWith(".json"));
    if (!jsonFile) {
      throw new Error("credential-health.json missing from workflow artifact.");
    }
    const text = await jsonFile.async("string");
    return JSON.parse(text);
  }

  function statusClass(status) {
    if (status === "ok") return "ok";
    if (status === "fail") return "fail";
    if (status === "missing") return "missing";
    return "unknown";
  }

  function friendlyCredentialError(error) {
    const text = String(error || "").trim();
    if (!text) return "";
    if (/invalid_grant/i.test(text)) {
      return "OAuth refresh token expired or revoked (invalid_grant)";
    }
    if (/Error validating access token|code.?190/i.test(text)) {
      return "Page access token expired or revoked";
    }
    if (/WHATSAPP_AUTH_B64 is set but invalid/i.test(text)) {
      return "WhatsApp session archive is invalid — re-export auth";
    }
    return text;
  }

  function findRecoveryForPlatform(report, platformName) {
    return (report.recovery || []).find(
      (item) =>
        item.id === platformName ||
        (item.id === "meta" && (platformName === "facebook" || platformName === "instagram")) ||
        (item.platforms || []).includes(platformName)
    );
  }

  function renderPlatformCard(name, platform, recovery) {
    const label = platform?.label || PLATFORM_LABELS[name] || name;
    const status = platform?.status || "missing";
    const message = platform?.message || "";
    const errorText = friendlyCredentialError(platform?.error);
    const detail =
      message ||
      errorText ||
      (status === "missing" ? "Not configured in GitHub Secrets" : "");
    const icon = PLATFORM_ICONS[name] || "•";
    const needsFix = status === "fail" || status === "missing";
    const setupCmd = recovery?.setupNpm || "";
    const showError = errorText && errorText !== detail;

    return `
      <article class="credential-card ${statusClass(status)}" data-platform="${name}">
        <div class="credential-card-head">
          <span class="credential-name"><span class="credential-icon" aria-hidden="true">${icon}</span>${escapeHtml(label)}</span>
          <span class="credential-badge ${statusClass(status)}">${STATUS_LABELS[status] || status.toUpperCase()}</span>
        </div>
        ${detail ? `<p class="credential-detail">${escapeHtml(detail)}</p>` : ""}
        ${showError ? `<p class="credential-error">${escapeHtml(errorText)}</p>` : ""}
        ${
          needsFix && setupCmd
            ? `<div class="credential-card-fix">
                <code class="credential-cmd">${escapeHtml(setupCmd)}</code>
                <button class="btn btn-secondary btn-sm copy-cmd" type="button" data-copy="${escapeHtml(setupCmd)}">Copy</button>
              </div>`
            : ""
        }
      </article>
    `;
  }

  function renderRecoveryPanel(recovery, config) {
    const errorText = friendlyCredentialError(recovery.error);
    const steps = [
      recovery.setupNpm
        ? `On your computer (in this repo), run: <code>${escapeHtml(recovery.setupNpm)}</code>`
        : null,
      ...(recovery.extraSteps || []).map((step) =>
        step.startsWith("npm ") ? `Then run: <code>${escapeHtml(step)}</code>` : escapeHtml(step)
      ),
      recovery.apiDisabled
        ? "Enable Google My Business APIs in Google Cloud Console, wait 2–5 minutes, then re-run setup"
        : null,
      "Copy the new values from the terminal into GitHub Secrets (button below)",
      'Click <strong>Re-check credentials</strong> here to confirm',
    ].filter(Boolean);

    const secretTags = (recovery.secrets || [])
      .map((secret) => `<code class="secret-tag">${escapeHtml(secret)}</code>`)
      .join(" ");

    return `
      <details class="credential-fix" open>
        <summary>Fix ${escapeHtml(recovery.label)}</summary>
        ${errorText ? `<p class="credential-error">${escapeHtml(errorText)}</p>` : ""}
        ${
          recovery.setupNpm
            ? `<div class="credential-cmd-block">
                <code>${escapeHtml(recovery.setupNpm)}</code>
                <button class="btn btn-secondary btn-sm copy-cmd" type="button" data-copy="${escapeHtml(recovery.setupNpm)}">Copy command</button>
              </div>`
            : ""
        }
        <ol class="fix-steps">
          ${steps.map((step) => `<li>${step}</li>`).join("")}
        </ol>
        ${secretTags ? `<p class="hint"><strong>GitHub Secrets to update:</strong><br>${secretTags}</p>` : ""}
        <div class="fix-actions">
          <button class="btn btn-secondary btn-sm copy-cmd" type="button" data-copy="npm run verify:fix">Copy verify:fix</button>
          <a class="btn btn-secondary btn-sm" href="${secretsUrl(config)}" target="_blank" rel="noopener">Open GitHub Secrets</a>
          <a class="btn btn-secondary btn-sm" href="${docsUrl(recovery.docPath || "docs/CREDENTIAL_RECOVERY.md")}" target="_blank" rel="noopener">Read guide</a>
        </div>
      </details>
    `;
  }

  function renderGitHubPatFix() {
    return `
      <details class="credential-fix" open>
        <summary>Fix GitHub token (Social Studio)</summary>
        <ol class="fix-steps">
          <li>Create a new token at <a href="https://github.com/settings/tokens" target="_blank" rel="noopener">github.com/settings/tokens</a></li>
          <li>Scopes: <strong>repo</strong> and <strong>workflow</strong></li>
          <li>Paste it in <strong>GitHub connection</strong> above and click Save settings</li>
        </ol>
        <div class="fix-actions">
          <button class="btn btn-secondary btn-sm scroll-github-token" type="button">Open GitHub connection</button>
        </div>
      </details>
    `;
  }

  function wireResultActions(config) {
    const root = document.getElementById("credentials-results");

    root.querySelectorAll(".copy-cmd").forEach((btn) => {
      const defaultLabel = btn.textContent;
      btn.addEventListener("click", async () => {
        const text = btn.getAttribute("data-copy");
        try {
          await navigator.clipboard.writeText(text);
          btn.textContent = "Copied!";
          setTimeout(() => {
            btn.textContent = defaultLabel;
          }, 1500);
        } catch {
          window.prompt("Copy this command:", text);
        }
      });
    });

    root.querySelectorAll(".scroll-github-token").forEach((btn) => {
      btn.addEventListener("click", () => {
        const panel = document.getElementById("settings-section") || document.querySelector(".settings");
        panel.open = true;
        panel.scrollIntoView({ behavior: "smooth" });
        document.getElementById("github-token").focus();
      });
    });
  }

  function renderReport(report, config, githubUser, { scrollToFix = false } = {}) {
    const root = document.getElementById("credentials-results");
    const summary = document.getElementById("credentials-summary");
    const btn = document.getElementById("credentials-check-btn");

    const platformCards = PLATFORM_ORDER.map((name) =>
      renderPlatformCard(name, report.platforms?.[name], findRecoveryForPlatform(report, name))
    ).join("");

    const githubCard = `
      <article class="credential-card ${githubUser ? "ok" : "fail"}">
        <div class="credential-card-head">
          <span class="credential-name"><span class="credential-icon" aria-hidden="true">${PLATFORM_ICONS.github}</span>GitHub (Social Studio)</span>
          <span class="credential-badge ${githubUser ? "ok" : "fail"}">${githubUser ? "Connected" : "Needs fix"}</span>
        </div>
        <p class="credential-detail">${githubUser ? `Signed in as @${escapeHtml(githubUser)}` : "Token missing or expired — update in GitHub connection"}</p>
      </article>
    `;

    const recoveryHtml = (report.recovery || []).map((item) => renderRecoveryPanel(item, config)).join("");
    const githubFix = githubUser ? "" : renderGitHubPatFix();
    const hasIssues = !report.ok || !githubUser;
    const fixesHeading =
      (report.recovery || []).length > 0
        ? `<h3 class="credential-fixes-heading">How to fix</h3>
           <p class="hint">Run each command on your computer in this repo, then paste the new values into GitHub Secrets.</p>`
        : "";

    const socialHtml =
      report.socialLinks?.length
        ? `<div class="credential-social"><p class="hint"><strong>Google Business social links</strong></p><ul>${report.socialLinks
            .map(
              (link) =>
                `<li>${escapeHtml(link.platform)}: <a href="${escapeHtml(link.url)}" target="_blank" rel="noopener">${escapeHtml(link.url)}</a></li>`
            )
            .join("")}</ul></div>`
        : "";

    const warnings =
      report.warnings?.length
        ? `<div class="credential-warnings">${report.warnings.map((w) => `<p class="hint">⚠ ${escapeHtml(w)}</p>`).join("")}</div>`
        : "";

    if (report.ok && githubUser) {
      summary.textContent = "All credentials look good — you're ready to publish.";
      summary.className = "credentials-summary ok";
    } else if ((report.recovery?.length || 0) > 0) {
      summary.textContent = `${report.recovery.length} platform${report.recovery.length === 1 ? "" : "s"} need attention. Follow the steps below.`;
      summary.className = "credentials-summary fail";
    } else if (!githubUser) {
      summary.textContent = "Fix your GitHub token first, then re-check all platforms.";
      summary.className = "credentials-summary fail";
    } else {
      summary.textContent = "Some credentials need attention.";
      summary.className = "credentials-summary fail";
    }

    renderStats(report, githubUser);
    updateHealthBadge(report, githubUser);
    if (btn) btn.textContent = "Re-check credentials";

    root.innerHTML = `
      <div class="credential-grid">${githubCard}${platformCards}</div>
      ${warnings}
      ${socialHtml}
      ${
        hasIssues
          ? `<div class="credential-fixes">${fixesHeading}${githubFix}${recoveryHtml}</div>`
          : ""
      }
      <p class="hint credentials-checked-at">Last checked: ${escapeHtml(formatRelativeTime(report.checkedAt))}</p>
    `;

    wireResultActions(config);

    if (scrollToFix && hasIssues) {
      const firstFix = root.querySelector(".credential-fix");
      if (firstFix) {
        setTimeout(() => firstFix.scrollIntoView({ behavior: "smooth", block: "nearest" }), 150);
      }
    }
  }

  async function runCredentialCheck() {
    const config = deps.getConfig();
    const btn = document.getElementById("credentials-check-btn");

    if (!config.token) {
      setCredentialsStatus("Save your GitHub token in GitHub connection first.", "error");
      const panel = document.getElementById("settings-section") || document.querySelector(".settings");
      panel.open = true;
      openCredentialsPanel();
      return;
    }

    openCredentialsPanel();
    hideCredentialsStatus();
    deps.setButtonLoading(btn, true);
    renderSkeleton();
    setProgressStep("github", "Verifying your GitHub token…");

    let githubUser = null;
    try {
      githubUser = await verifyGitHubPat(config);
      setProgressStep("dispatch", `Signed in as @${githubUser}. Starting credential check…`);
    } catch (error) {
      renderReport(
        {
          ok: false,
          checkedAt: new Date().toISOString(),
          platforms: Object.fromEntries(
            PLATFORM_ORDER.map((name) => [name, { status: "missing", label: PLATFORM_LABELS[name] }])
          ),
          recovery: [],
          socialLinks: [],
          warnings: [],
        },
        config,
        null,
        { scrollToFix: true }
      );
      setCredentialsStatus(error.message, "error");
      hideProgress();
      deps.setButtonLoading(btn, false);
      return;
    }

    try {
      const startedAt = new Date(Date.now() - 5000);
      await dispatchVerifyWorkflow(config);
      setProgressStep("workflow", "Running checks on GitHub Actions (usually 30–60 seconds)…");
      renderSkeleton();

      const run = await waitForVerifyWorkflow(config, startedAt, (activeRun) => {
        setProgressStep(
          "workflow",
          `Checking credentials on GitHub… <a href="${escapeHtml(activeRun.html_url)}" target="_blank" rel="noopener">View run</a>`
        );
      });

      setProgressStep("report", "Downloading results…");
      const report = await downloadCredentialReport(config, run.id);
      saveCachedReport(report, githubUser);
      renderReport(report, config, githubUser, { scrollToFix: !report.ok });

      if (report.ok) {
        setCredentialsStatus("All credentials OK. You can publish safely.", "ok");
      } else {
        const fixCount = report.recovery?.length || 0;
        setCredentialsStatus(
          fixCount
            ? `${fixCount} platform${fixCount === 1 ? "" : "s"} need a fix — copy the command on each card (or below), run it locally, update Secrets, then re-check.`
            : "Some credentials failed — see details below.",
          "error"
        );
      }
    } catch (error) {
      const message = friendlyWorkflowError(error.message);
      const failedRunUrl = String(error.message).match(/(https:\/\/github\.com\S+)/)?.[1];
      const runLink = failedRunUrl
        ? ` <a href="${escapeHtml(failedRunUrl)}" target="_blank" rel="noopener">View failed run</a>`
        : ` <a href="${actionsUrl(config)}" target="_blank" rel="noopener">Open GitHub Actions</a>`;
      setCredentialsStatus(`${escapeHtml(message)}${runLink}`, "error", { html: true });
      openCredentialsPanel();
    } finally {
      hideProgress();
      deps.setButtonLoading(btn, false);
    }
  }

  function init(dependencies) {
    deps = dependencies;
    const btn = document.getElementById("credentials-check-btn");
    if (!btn) return;

    btn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      runCredentialCheck();
    });

    const config = deps.getConfig();
    if (!config.token) return;

    verifyGitHubPat(config)
      .then((login) => {
        const cached = loadCachedReport();
        if (cached) {
          renderReport(cached.report, config, cached.githubUser);
          setCredentialsStatus(
            `GitHub connected as @${login}. Last check ${formatRelativeTime(cached.report.checkedAt)} — click Re-check to refresh.`,
            "ok"
          );
          if (!cached.report.ok) openCredentialsPanel();
        } else {
          setCredentialsStatus(
            `GitHub connected as @${login}. Click Check credentials to verify all platforms.`,
            "ok"
          );
        }
      })
      .catch(() => {
        setCredentialsStatus("GitHub token may be expired. Update it in GitHub connection.", "error");
        openCredentialsPanel();
      });
  }

  window.CredentialsHealth = { init, runCredentialCheck };
})();
