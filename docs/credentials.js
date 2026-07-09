/**
 * Social Studio — credential health panel.
 * Checks GitHub PAT locally; checks platform secrets via verify-credentials workflow.
 */
(function () {
  const WORKFLOW_VERIFY = "verify-credentials.yml";
  const PLATFORM_ORDER = ["facebook", "instagram", "youtube", "whatsapp", "google_business"];
  const PLATFORM_LABELS = {
    facebook: "Facebook",
    instagram: "Instagram",
    youtube: "YouTube",
    whatsapp: "WhatsApp Status",
    google_business: "Google Business",
  };

  let deps = null;

  function secretsUrl(config) {
    return `https://github.com/${config.owner}/${config.repo}/settings/secrets/actions`;
  }

  function docsUrl(path) {
    return `https://github.com/fnsventures/social-media-automation/blob/master/${path}`;
  }

  async function verifyGitHubPat(config) {
    const response = await fetch("https://api.github.com/user", {
      headers: deps.authHeaders(config),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`GitHub token invalid (${response.status}): ${text}`);
    }
    const user = await response.json();
    return user.login || "connected";
  }

  async function dispatchVerifyWorkflow(config) {
    await deps.api(config, `/repos/${config.owner}/${config.repo}/actions/workflows/${WORKFLOW_VERIFY}/dispatches`, {
      method: "POST",
      body: JSON.stringify({ ref: config.branch }),
    });
  }

  async function waitForVerifyWorkflow(config, startedAfter) {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const data = await deps.api(
        config,
        `/repos/${config.owner}/${config.repo}/actions/workflows/${WORKFLOW_VERIFY}/runs?per_page=5`
      );

      const run = data.workflow_runs.find(
        (entry) =>
          entry.event === "workflow_dispatch" &&
          new Date(entry.created_at) >= startedAfter
      );

      if (run?.status === "completed") {
        return run;
      }

      await deps.sleep(3000);
    }
    throw new Error("Timed out waiting for credential check workflow.");
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
    const zip = await window.JSZip.loadAsync(buffer);
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

  function renderPlatformCard(name, platform) {
    const label = platform?.label || PLATFORM_LABELS[name] || name;
    const status = platform?.status || "missing";
    const detail = platform?.message || platform?.error || (status === "missing" ? "Not configured in GitHub Secrets" : "");
    return `
      <article class="credential-card ${statusClass(status)}" data-platform="${name}">
        <div class="credential-card-head">
          <span class="credential-name">${escapeHtml(label)}</span>
          <span class="credential-badge ${statusClass(status)}">${status.toUpperCase()}</span>
        </div>
        ${detail ? `<p class="credential-detail">${escapeHtml(detail)}</p>` : ""}
      </article>
    `;
  }

  function renderRecoveryPanel(recovery, config) {
    const steps = [
      recovery.setupNpm
        ? `On your computer, run: <code>${escapeHtml(recovery.setupNpm)}</code>`
        : null,
      ...(recovery.extraSteps || []).map((step) =>
        step.startsWith("npm ") ? `<code>${escapeHtml(step)}</code>` : escapeHtml(step)
      ),
      recovery.apiDisabled
        ? "Enable Google My Business APIs in Google Cloud Console, wait 2–5 minutes, then re-run setup"
        : null,
      "Copy the new values to GitHub Secrets (button below)",
      "Click <strong>Re-check credentials</strong> here to confirm",
    ].filter(Boolean);

    const secretTags = (recovery.secrets || [])
      .map((secret) => `<code class="secret-tag">${escapeHtml(secret)}</code>`)
      .join(" ");

    return `
      <details class="credential-fix" open>
        <summary>Fix ${escapeHtml(recovery.label)}</summary>
        ${recovery.error ? `<p class="credential-error">${escapeHtml(recovery.error)}</p>` : ""}
        <ol class="fix-steps">
          ${steps.map((step) => `<li>${step}</li>`).join("")}
        </ol>
        ${secretTags ? `<p class="hint"><strong>GitHub Secrets to update:</strong><br>${secretTags}</p>` : ""}
        <div class="fix-actions">
          ${
            recovery.setupNpm
              ? `<button class="btn btn-secondary btn-sm copy-cmd" type="button" data-copy="${escapeHtml(recovery.setupNpm)}">Copy command</button>`
              : ""
          }
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
          <li>Paste it in <strong>GitHub connection</strong> below and click Save settings</li>
        </ol>
        <div class="fix-actions">
          <button class="btn btn-secondary btn-sm scroll-github-token" type="button">Open GitHub connection</button>
        </div>
      </details>
    `;
  }

  function renderReport(report, config, githubUser) {
    const root = document.getElementById("credentials-results");
    const summary = document.getElementById("credentials-summary");

    const platformCards = PLATFORM_ORDER.map((name) =>
      renderPlatformCard(name, report.platforms?.[name])
    ).join("");

    const githubCard = `
      <article class="credential-card ${githubUser ? "ok" : "fail"}">
        <div class="credential-card-head">
          <span class="credential-name">GitHub (Social Studio)</span>
          <span class="credential-badge ${githubUser ? "ok" : "fail"}">${githubUser ? "OK" : "FAIL"}</span>
        </div>
        <p class="credential-detail">${githubUser ? `Signed in as @${escapeHtml(githubUser)}` : "Token missing or expired — update in GitHub connection"}</p>
      </article>
    `;

    const recoveryHtml = (report.recovery || []).map((item) => renderRecoveryPanel(item, config)).join("");
    const githubFix = githubUser ? "" : renderGitHubPatFix();

    const socialHtml =
      report.socialLinks?.length
        ? `<div class="credential-social"><p class="hint"><strong>Google Business social links</strong></p><ul>${report.socialLinks
            .map((link) => `<li>${escapeHtml(link.platform)}: <a href="${escapeHtml(link.url)}" target="_blank" rel="noopener">${escapeHtml(link.url)}</a></li>`)
            .join("")}</ul></div>`
        : "";

    const warnings =
      report.warnings?.length
        ? `<div class="credential-warnings">${report.warnings.map((w) => `<p class="hint">⚠ ${escapeHtml(w)}</p>`).join("")}</div>`
        : "";

    summary.textContent = report.ok
      ? "All platform credentials look good."
      : `${report.recovery?.length || 0} credential group(s) need attention.`;
    summary.className = `credentials-summary ${report.ok ? "ok" : "fail"}`;

    root.innerHTML = `
      <div class="credential-grid">${githubCard}${platformCards}</div>
      ${warnings}
      ${socialHtml}
      ${githubFix}
      ${recoveryHtml}
      <p class="hint credentials-checked-at">Last checked: ${escapeHtml(new Date(report.checkedAt).toLocaleString())}</p>
    `;

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
        const panel = document.querySelector(".settings");
        panel.open = true;
        panel.scrollIntoView({ behavior: "smooth" });
        document.getElementById("github-token").focus();
      });
    });
  }

  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text ?? "";
    return div.innerHTML;
  }

  function setCredentialsStatus(message, type = "") {
    const el = document.getElementById("credentials-status");
    el.classList.remove("hidden");
    el.textContent = message;
    el.className = `status${type ? ` ${type}` : ""}`;
  }

  async function runCredentialCheck() {
    const config = deps.getConfig();
    const btn = document.getElementById("credentials-check-btn");

    if (!config.token) {
      setCredentialsStatus("Save your GitHub token in settings first.", "error");
      document.querySelector(".settings").open = true;
      return;
    }

    deps.setButtonLoading(btn, true);
    setCredentialsStatus("Checking GitHub token…");

    let githubUser = null;
    try {
      githubUser = await verifyGitHubPat(config);
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
        null
      );
      setCredentialsStatus(error.message, "error");
      deps.setButtonLoading(btn, false);
      return;
    }

    setCredentialsStatus("Running credential check on GitHub Actions…");

    try {
      const startedAt = new Date();
      await dispatchVerifyWorkflow(config);
      const run = await waitForVerifyWorkflow(config, startedAt);
      const report = await downloadCredentialReport(config, run.id);
      renderReport(report, config, githubUser);

      if (report.ok) {
        setCredentialsStatus("All credentials OK. You can publish safely.", "ok");
      } else {
        setCredentialsStatus("Some credentials failed. Follow the fix steps below.", "error");
      }
    } catch (error) {
      const hint = String(error.message).includes("404") || String(error.message).includes("Not Found")
        ? " The verify-credentials workflow may not be on your branch yet — merge the latest code or ensure Branch is set to studio in settings."
        : "";
      setCredentialsStatus(`${error.message}${hint}`, "error");
    } finally {
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
    if (config.token) {
      verifyGitHubPat(config)
        .then((login) => {
          setCredentialsStatus(`GitHub connected as @${login}. Click "Check credentials" to verify all platforms.`, "ok");
        })
        .catch(() => {
          setCredentialsStatus("GitHub token may be expired. Update it in GitHub connection.", "error");
        });
    }
  }

  window.CredentialsHealth = { init, runCredentialCheck };
})();
