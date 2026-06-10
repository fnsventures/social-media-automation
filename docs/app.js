const DEFAULTS = {
  owner: "privatefnsventures-maker",
  repo: "social-media-automation",
  branch: "master",
};

const WORKFLOWS = {
  create: "create-ai-content.yml",
  publish: "approve-and-publish.yml",
};

const PLATFORMS = ["facebook", "instagram", "youtube"];
const SESSION_KEY = "sm-session";

function loadConfig() {
  const saved = JSON.parse(localStorage.getItem("sm-config") || "{}");
  return { ...DEFAULTS, ...saved };
}

function saveConfig(config) {
  localStorage.setItem("sm-config", JSON.stringify(config));
}

function authHeaders(config) {
  return {
    Authorization: `Bearer ${config.token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function rawUrl(config, filePath) {
  return `https://raw.githubusercontent.com/${config.owner}/${config.repo}/${config.branch}/${filePath}`;
}

async function api(config, path, options = {}) {
  const response = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      ...authHeaders(config),
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${response.status}: ${text}`);
  }

  if (response.status === 204) return null;
  return response.json();
}

async function dispatchWorkflow(config, workflowFile, inputs) {
  await api(
    config,
    `/repos/${config.owner}/${config.repo}/actions/workflows/${workflowFile}/dispatches`,
    {
      method: "POST",
      body: JSON.stringify({ ref: config.branch, inputs }),
    }
  );
}

async function waitForWorkflow(config, workflowFile, startedAfter) {
  for (let attempt = 0; attempt < 90; attempt += 1) {
    const data = await api(
      config,
      `/repos/${config.owner}/${config.repo}/actions/workflows/${workflowFile}/runs?per_page=10`
    );

    const run = data.workflow_runs.find(
      (entry) =>
        entry.event === "workflow_dispatch" &&
        new Date(entry.created_at) >= startedAfter
    );

    if (run) {
      if (run.status === "completed") {
        if (run.conclusion !== "success") {
          throw new Error(`Workflow failed: ${run.html_url}`);
        }
        return run;
      }
    }

    await sleep(4000);
  }

  throw new Error("Timed out waiting for GitHub Actions workflow.");
}

function decodeBase64Utf8(base64) {
  const binary = atob(base64.replace(/\s/g, ""));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder("utf-8").decode(bytes);
}

async function fetchRepoText(config, filePath) {
  const data = await api(
    config,
    `/repos/${config.owner}/${config.repo}/contents/${filePath}?ref=${encodeURIComponent(config.branch)}`
  );

  if (Array.isArray(data)) {
    throw new Error(`Expected file: ${filePath}`);
  }

  return decodeBase64Utf8(data.content);
}

async function loadGeneratedPost(config, generatedAfter, maxAttempts = 20) {
  let lastError = null;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const manifest = JSON.parse(
        await fetchRepoText(config, "content/.last-generated.json")
      );

      if (generatedAfter && new Date(manifest.created_at) < generatedAfter) {
        throw new Error("Waiting for updated manifest...");
      }

      const yamlText = await fetchRepoText(
        config,
        `content/posts/${manifest.post_id}.yaml`
      );
      const post = window.jsyaml.load(yamlText);
      return { manifest, post };
    } catch (error) {
      lastError = error;
      await sleep(2000);
    }
  }

  throw lastError ?? new Error("Could not load generated post.");
}

function saveSession(topic, post) {
  sessionStorage.setItem(
    SESSION_KEY,
    JSON.stringify({
      topic,
      post,
      savedAt: new Date().toISOString(),
    })
  );
}

function loadSession() {
  const raw = sessionStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function selectedPlatforms() {
  return PLATFORMS.filter((platform) =>
    document.getElementById(`platform-${platform}`).checked
  );
}

function setStatus(elementId, message, type = "") {
  const el = document.getElementById(elementId);
  el.classList.remove("hidden");
  el.textContent = message;
  el.className = `status${type ? ` ${type}` : ""}`;
}

function setStep(step) {
  document.querySelectorAll(".step").forEach((node, index) => {
    node.classList.remove("active", "done");
    if (index + 1 < step) node.classList.add("done");
    if (index + 1 === step) node.classList.add("active");
  });
}

function renderPreview(config, post, topic = "") {
  const preview = document.getElementById("preview");
  const tags = (post.hashtags || []).map((tag) => `#${tag}`).join(" ");
  let mediaHtml = "";
  const cacheBust = Date.now();

  if (post.media?.image) {
    mediaHtml += `<img src="${rawUrl(config, post.media.image)}?t=${cacheBust}" alt="Generated image" />`;
  }
  if (post.media?.video) {
    mediaHtml += `<video controls src="${rawUrl(config, post.media.video)}?t=${cacheBust}"></video>`;
  }

  preview.innerHTML = `
    <p><strong>Post ID:</strong> <code>${post.id}</code></p>
    <p><strong>Status:</strong> ${post.status}</p>
    <p><strong>Platforms:</strong> ${(post.platforms || []).join(", ")}</p>
    <p><strong>Title:</strong> ${post.title || ""}</p>
    <pre>${post.caption || ""}${tags ? `\n\n${tags}` : ""}</pre>
    ${mediaHtml}
  `;

  document.getElementById("review-section").classList.remove("hidden");
  setStep(2);
  currentPost = post;
  if (topic) {
    saveSession(topic, post);
  }
}

function getConfigFromForm() {
  return {
    token: document.getElementById("github-token").value.trim(),
    owner: document.getElementById("github-owner").value.trim() || DEFAULTS.owner,
    repo: document.getElementById("github-repo").value.trim() || DEFAULTS.repo,
    branch: document.getElementById("github-branch").value.trim() || DEFAULTS.branch,
  };
}

let currentPost = null;

document.getElementById("save-config").addEventListener("click", () => {
  const config = getConfigFromForm();
  if (!config.token) {
    setStatus("config-status", "GitHub token is required.", "error");
    return;
  }
  saveConfig(config);
  setStatus("config-status", "Settings saved in this browser.", "ok");
});

document.getElementById("generate-btn").addEventListener("click", async () => {
  const config = getConfigFromForm();
  if (!config.token) {
    setStatus("generate-status", "Save your GitHub token first.", "error");
    return;
  }

  const topic = document.getElementById("prompt").value.trim();
  if (!topic) {
    setStatus("generate-status", "Enter a prompt/topic first.", "error");
    return;
  }

  const mediaType = document.getElementById("media-type").value;
  const platforms = selectedPlatforms();
  if (platforms.length === 0) {
    setStatus("generate-status", "Select at least one platform.", "error");
    return;
  }

  const btn = document.getElementById("generate-btn");
  btn.disabled = true;
  setStatus("generate-status", "Starting AI generation workflow...");
  setStep(1);

  try {
    const startedAt = new Date();
    await dispatchWorkflow(config, WORKFLOWS.create, {
      topic,
      media_type: mediaType,
      platforms: platforms.join(","),
    });

    setStatus(
      "generate-status",
      "Generating caption and media on GitHub Actions (ignore any Pages deployment — that is separate)..."
    );
    await waitForWorkflow(config, WORKFLOWS.create, startedAt);

    setStatus("generate-status", "Loading generated post from repository...");
    const { post } = await loadGeneratedPost(config, startedAt);
    renderPreview(config, post, topic);
    setStatus(
      "generate-status",
      "Content generated. Review below, then verify and publish.",
      "ok"
    );
  } catch (error) {
    setStatus("generate-status", error.message, "error");
  } finally {
    btn.disabled = false;
  }
});

document.getElementById("reload-btn").addEventListener("click", async () => {
  const config = getConfigFromForm();
  if (!config.token) {
    setStatus("generate-status", "Save your GitHub token first.", "error");
    return;
  }

  const btn = document.getElementById("reload-btn");
  btn.disabled = true;
  setStatus("generate-status", "Loading latest generated post...");

  try {
    const { post, manifest } = await loadGeneratedPost(config);
    const topic = manifest.topic || post.topic || "";
    if (topic) {
      document.getElementById("prompt").value = topic;
    }
    renderPreview(config, post, topic);
    setStatus(
      "generate-status",
      "Loaded latest generated post. Review below, then verify and publish.",
      "ok"
    );
  } catch (error) {
    setStatus("generate-status", error.message, "error");
  } finally {
    btn.disabled = false;
  }
});

document.getElementById("verify-btn").addEventListener("click", () => {
  if (!currentPost) {
    setStatus("verify-status", "Generate content first.", "error");
    return;
  }

  const errors = [];
  const warnings = [];

  if (!currentPost.caption) errors.push("Missing caption.");
  if (!(currentPost.platforms || []).length) errors.push("No platforms selected.");
  if (
    currentPost.platforms.includes("instagram") &&
    !currentPost.media?.image &&
    !currentPost.media?.video
  ) {
    errors.push("Instagram needs an image or video.");
  }
  if (
    currentPost.platforms.includes("youtube") &&
    !currentPost.media?.image &&
    !currentPost.media?.video
  ) {
    errors.push("YouTube needs an image or video.");
  }
  if (
    currentPost.platforms.includes("youtube") &&
    currentPost.media?.image &&
    !currentPost.media?.video
  ) {
    warnings.push("YouTube will auto-create a short video from the image.");
  }
  if (currentPost.status !== "review") {
    warnings.push(`Status is "${currentPost.status}" (expected review).`);
  }

  const lines = [];
  warnings.forEach((line) => lines.push(`WARN: ${line}`));
  errors.forEach((line) => lines.push(`ERROR: ${line}`));

  if (errors.length) {
    setStatus("verify-status", lines.join("\n"), "error");
    return;
  }

  setStatus(
    "verify-status",
    `${lines.join("\n")}${lines.length ? "\n\n" : ""}Verification passed. Ready to publish.`,
    "ok"
  );
  setStep(3);
  document.getElementById("publish-section").classList.remove("hidden");
});

document.getElementById("publish-btn").addEventListener("click", async () => {
  const config = getConfigFromForm();
  if (!currentPost) {
    setStatus("publish-status", "Nothing to publish.", "error");
    return;
  }

  const dryRun = document.getElementById("dry-run").checked;
  const btn = document.getElementById("publish-btn");
  btn.disabled = true;
  setStatus(
    "publish-status",
    dryRun ? "Running dry-run publish..." : "Approving and publishing..."
  );

  try {
    const startedAt = new Date();
    await dispatchWorkflow(config, WORKFLOWS.publish, {
      post_id: currentPost.id,
      dry_run: String(dryRun),
      publish: "true",
    });

    await waitForWorkflow(config, WORKFLOWS.publish, startedAt);
    setStep(4);
    setStatus(
      "publish-status",
      dryRun
        ? "Dry run completed. Uncheck dry run and publish again to go live."
        : "Published to Facebook, Instagram, and YouTube.",
      "ok"
    );
  } catch (error) {
    setStatus("publish-status", error.message, "error");
  } finally {
    btn.disabled = false;
  }
});

window.addEventListener("DOMContentLoaded", () => {
  const config = loadConfig();
  document.getElementById("github-owner").value = config.owner;
  document.getElementById("github-repo").value = config.repo;
  document.getElementById("github-branch").value = config.branch;
  if (config.token) {
    document.getElementById("github-token").value = config.token;
  }

  const session = loadSession();
  if (session?.post) {
    currentPost = session.post;
    if (session.topic) {
      document.getElementById("prompt").value = session.topic;
    }
    renderPreview(config, session.post);
    setStatus(
      "generate-status",
      "Restored your last generated post from this browser session.",
      "ok"
    );
  }
});
