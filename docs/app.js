const DEFAULTS = {
  owner: "privatefnsventures-maker",
  repo: "social-media-automation",
  branch: "master",
};

const WORKFLOW_PUBLISH = "approve-and-publish.yml";
const PLATFORMS = ["facebook", "instagram", "youtube"];
const SESSION_KEY = "sm-draft";

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

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

function parseHashtags(value) {
  return value
    .split(",")
    .map((tag) => tag.trim().replace(/^#/, ""))
    .filter(Boolean);
}

function fileExtension(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith(".mp4") || name.endsWith(".mov") || file.type.startsWith("video/")) {
    return ".mp4";
  }
  if (name.endsWith(".png") || file.type === "image/png") return ".png";
  if (name.endsWith(".webp") || file.type === "image/webp") return ".webp";
  return ".jpg";
}

function isVideoFile(file) {
  return file.type.startsWith("video/") || /\.(mp4|mov|webm)$/i.test(file.name);
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

async function dispatchWorkflow(config, inputs) {
  await api(
    config,
    `/repos/${config.owner}/${config.repo}/actions/workflows/${WORKFLOW_PUBLISH}/dispatches`,
    {
      method: "POST",
      body: JSON.stringify({ ref: config.branch, inputs }),
    }
  );
}

async function waitForWorkflow(config, startedAfter) {
  for (let attempt = 0; attempt < 90; attempt += 1) {
    const data = await api(
      config,
      `/repos/${config.owner}/${config.repo}/actions/workflows/${WORKFLOW_PUBLISH}/runs?per_page=10`
    );

    const run = data.workflow_runs.find(
      (entry) =>
        entry.event === "workflow_dispatch" &&
        new Date(entry.created_at) >= startedAfter
    );

    if (run?.status === "completed") {
      if (run.conclusion !== "success") {
        throw new Error(`Publish workflow failed: ${run.html_url}`);
      }
      return run;
    }

    await sleep(4000);
  }

  throw new Error("Timed out waiting for publish workflow.");
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function textToBase64(text) {
  return btoa(unescape(encodeURIComponent(text)));
}

async function uploadFile(config, repoPath, base64Content, message) {
  await api(
    config,
    `/repos/${config.owner}/${config.repo}/contents/${repoPath}`,
    {
      method: "PUT",
      body: JSON.stringify({
        message,
        content: base64Content,
        branch: config.branch,
      }),
    }
  );
}

function getConfigFromForm() {
  return {
    token: document.getElementById("github-token").value.trim(),
    owner: document.getElementById("github-owner").value.trim() || DEFAULTS.owner,
    repo: document.getElementById("github-repo").value.trim() || DEFAULTS.repo,
    branch: document.getElementById("github-branch").value.trim() || DEFAULTS.branch,
  };
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

function saveDraft(draft) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({ ...draft, savedAt: new Date().toISOString() }));
}

function loadDraft() {
  const raw = sessionStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function buildPostYaml(draft) {
  const post = {
    id: draft.id,
    status: "review",
    publish_at: "",
    platforms: draft.platforms,
    title: draft.title,
    caption: draft.caption,
    hashtags: draft.hashtags,
    media: {},
    created_at: new Date().toISOString(),
  };

  if (draft.mediaType === "video") {
    post.media.video = draft.mediaPath;
  } else {
    post.media.image = draft.mediaPath;
  }

  return window.jsyaml.dump(post, { lineWidth: 120 });
}

function renderPreview(container, draft, mediaUrl) {
  const tags = draft.hashtags.map((tag) => `#${tag}`).join(" ");
  let mediaHtml = "";

  if (draft.mediaType === "video") {
    mediaHtml = `<video controls src="${mediaUrl}"></video>`;
  } else {
    mediaHtml = `<img src="${mediaUrl}" alt="Post media" />`;
  }

  container.innerHTML = `
    <p><strong>Post ID:</strong> <code>${draft.id}</code></p>
    <p><strong>Platforms:</strong> ${draft.platforms.join(", ")}</p>
    <p><strong>Title:</strong> ${draft.title}</p>
    <pre>${draft.caption}${tags ? `\n\n${tags}` : ""}</pre>
    ${mediaHtml}
  `;
}

function validateDraftInput() {
  const title = document.getElementById("title").value.trim();
  const caption = document.getElementById("caption").value.trim();
  const fileInput = document.getElementById("media-file");
  const platforms = selectedPlatforms();
  const file = fileInput.files?.[0];

  if (!title) throw new Error("Enter a title.");
  if (!caption) throw new Error("Enter a caption.");
  if (!file) throw new Error("Choose a photo or video to upload.");
  if (platforms.length === 0) throw new Error("Select at least one platform.");
  if (file.size > 25 * 1024 * 1024) {
    throw new Error("File is larger than 25 MB. Use a smaller file.");
  }

  const id = `${slugify(title)}-${Date.now()}`;
  const ext = fileExtension(file);
  const mediaType = isVideoFile(file) ? "video" : "image";

  return {
    id,
    title,
    caption,
    hashtags: parseHashtags(document.getElementById("hashtags").value),
    platforms,
    file,
    mediaType,
    mediaPath: `media/${id}${ext}`,
    saved: false,
  };
}

let draft = null;
let previewUrl = null;

function revokePreviewUrl() {
  if (previewUrl) {
    URL.revokeObjectURL(previewUrl);
    previewUrl = null;
  }
}

document.getElementById("save-config").addEventListener("click", () => {
  const config = getConfigFromForm();
  if (!config.token) {
    setStatus("config-status", "GitHub token is required.", "error");
    return;
  }
  saveConfig(config);
  setStatus("config-status", "Settings saved in this browser.", "ok");
});

document.getElementById("media-file").addEventListener("change", () => {
  const file = document.getElementById("media-file").files?.[0];
  const preview = document.getElementById("upload-preview");
  revokePreviewUrl();

  if (!file) {
    preview.classList.add("hidden");
    preview.innerHTML = "";
    return;
  }

  previewUrl = URL.createObjectURL(file);
  preview.classList.remove("hidden");
  if (isVideoFile(file)) {
    preview.innerHTML = `<video controls src="${previewUrl}"></video>`;
  } else {
    preview.innerHTML = `<img src="${previewUrl}" alt="Selected media" />`;
  }
});

document.getElementById("review-btn").addEventListener("click", () => {
  try {
    draft = validateDraftInput();
    revokePreviewUrl();
    previewUrl = URL.createObjectURL(draft.file);
    renderPreview(document.getElementById("preview"), draft, previewUrl);
    document.getElementById("review-section").classList.remove("hidden");
    document.getElementById("publish-section").classList.add("hidden");
    setStep(2);
    setStatus("review-status", "Check everything looks correct, then save to GitHub.", "ok");
  } catch (error) {
    setStatus("upload-status", error.message, "error");
  }
});

document.getElementById("back-btn").addEventListener("click", () => {
  document.getElementById("review-section").classList.add("hidden");
  document.getElementById("publish-section").classList.add("hidden");
  setStep(1);
});

document.getElementById("save-btn").addEventListener("click", async () => {
  const config = getConfigFromForm();
  if (!config.token) {
    setStatus("review-status", "Save your GitHub token first.", "error");
    return;
  }
  if (!draft) {
    setStatus("review-status", "Nothing to save.", "error");
    return;
  }

  const btn = document.getElementById("save-btn");
  btn.disabled = true;
  setStatus("review-status", "Uploading media and post to GitHub...");

  try {
    const mediaBase64 = await fileToBase64(draft.file);
    await uploadFile(
      config,
      draft.mediaPath,
      mediaBase64,
      `content: upload media for ${draft.id}`
    );

    const yaml = buildPostYaml(draft);
    await uploadFile(
      config,
      `content/posts/${draft.id}.yaml`,
      textToBase64(yaml),
      `content: draft post ${draft.id}`
    );

    draft.saved = true;
    saveDraft({ ...draft, fileName: draft.file.name, file: null });

    document.getElementById("publish-section").classList.remove("hidden");
    setStep(3);
    setStatus("review-status", "Saved to GitHub. Ready to publish.", "ok");
  } catch (error) {
    setStatus("review-status", error.message, "error");
  } finally {
    btn.disabled = false;
  }
});

document.getElementById("publish-btn").addEventListener("click", async () => {
  const config = getConfigFromForm();
  if (!draft?.saved) {
    setStatus("publish-status", "Save to GitHub first.", "error");
    return;
  }

  const dryRun = document.getElementById("dry-run").checked;
  const btn = document.getElementById("publish-btn");
  btn.disabled = true;
  setStatus("publish-status", dryRun ? "Running dry run..." : "Publishing...");

  try {
    const startedAt = new Date();
    await dispatchWorkflow(config, {
      post_id: draft.id,
      dry_run: dryRun,
      publish: true,
    });
    await waitForWorkflow(config, startedAt);
    setStatus(
      "publish-status",
      dryRun
        ? "Dry run passed. Uncheck dry run and publish again to go live."
        : "Published to your selected platforms.",
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

  const saved = loadDraft();
  if (saved?.saved) {
    draft = saved;
    document.getElementById("title").value = saved.title || "";
    document.getElementById("caption").value = saved.caption || "";
    document.getElementById("hashtags").value = (saved.hashtags || []).join(", ");
    PLATFORMS.forEach((platform) => {
      document.getElementById(`platform-${platform}`).checked = (saved.platforms || []).includes(platform);
    });
    renderPreview(
      document.getElementById("preview"),
      saved,
      `https://raw.githubusercontent.com/${config.owner}/${config.repo}/${config.branch}/${saved.mediaPath}?t=${Date.now()}`
    );
    document.getElementById("review-section").classList.remove("hidden");
    document.getElementById("publish-section").classList.remove("hidden");
    setStep(3);
    setStatus("review-status", `Restored saved post "${saved.id}". You can publish again.`, "ok");
  }
});
