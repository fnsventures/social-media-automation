const DEFAULTS = {
  owner: "fnsventures",
  repo: "social-media-automation",
  branch: "studio",
};

const WORKFLOW_PUBLISH = "approve-and-publish.yml";
const PLATFORMS = ["facebook", "instagram", "youtube", "whatsapp", "google_business"];
const IMAGE_AUTO_PLATFORMS = ["instagram", "youtube", "whatsapp", "google_business"];
const PLATFORM_LABELS = {
  whatsapp: "WhatsApp Status",
  google_business: "Google Business",
};
const SESSION_KEY = "sm-draft";
const SCHEDULED_CACHE_KEY = "sm-scheduled-cache";
const SCHEDULED_CACHE_TTL_MS = 60_000;

const $ = (id) => document.getElementById(id);

function repoApiBase(config) {
  return `/repos/${config.owner}/${config.repo}`;
}

function pollDelay(attempt) {
  if (attempt < 5) return 2000;
  if (attempt < 15) return 3000;
  return 4000;
}

function loadConfig() {
  const saved = JSON.parse(localStorage.getItem("sm-config") || "{}");
  const config = { ...DEFAULTS, ...saved };
  if (config.branch === "master") {
    config.branch = "studio";
    localStorage.setItem("sm-config", JSON.stringify(config));
  }
  return config;
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

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isScheduledMode() {
  return $("publish-scheduled").checked;
}

function defaultScheduleDatetime() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(9, 0, 0, 0);
  return toDatetimeLocalValue(date);
}

function toDatetimeLocalValue(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function readScheduleFromForm() {
  if (!isScheduledMode()) {
    return { publishAt: "", eventName: "" };
  }

  const publishAtRaw = document.getElementById("publish-at").value;
  const eventName = document.getElementById("event-name").value.trim();

  if (!publishAtRaw) {
    throw new Error("Choose a publish date and time for scheduled posts.");
  }

  const publishAt = new Date(publishAtRaw);
  if (Number.isNaN(publishAt.getTime())) {
    throw new Error("Invalid publish date and time.");
  }
  if (publishAt.getTime() <= Date.now()) {
    throw new Error("Scheduled time must be in the future.");
  }

  return { publishAt: publishAt.toISOString(), eventName };
}

function formatScheduleDisplay(isoString) {
  if (!isoString) return "";
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return isoString;
  return date.toLocaleString(undefined, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function base64ToText(b64) {
  const bytes = Uint8Array.from(atob(b64.replace(/\s/g, "")), (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function updateStepNavLabel() {
  $("step-3-label").textContent =
    isScheduledMode() || Boolean(draft?.publishAt) ? "3. Schedule" : "3. Publish";
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

function friendlyApiError(message) {
  const text = parseApiError(message);
  if (text.includes("Bad credentials") || text.includes("401")) {
    return "GitHub token is invalid or expired. Update it in GitHub connection settings.";
  }
  if (text.includes("Resource not accessible") || text.includes("403")) {
    return "Token lacks permission. Ensure it has repo and workflow scopes.";
  }
  if (text.includes("Changes must be made through a pull request") || text.includes("409")) {
    return "This branch is protected. Set Branch to studio (not master) in GitHub connection.";
  }
  return text;
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
    throw new Error(friendlyApiError(`${response.status}: ${text}`));
  }

  if (response.status === 204) return null;
  return response.json();
}

async function dispatchWorkflow(config, inputs) {
  await api(config, `${repoApiBase(config)}/actions/workflows/${WORKFLOW_PUBLISH}/dispatches`, {
    method: "POST",
    body: JSON.stringify({ ref: config.branch, inputs }),
  });
}

async function waitForDispatchedRun(
  config,
  workflowFile,
  startedAfter,
  onProgress,
  maxAttempts = 90,
  failureLabel = "Workflow",
  options = {}
) {
  const { allowFailure = false } = options;
  const base = repoApiBase(config);
  let runId = null;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const run = runId
      ? await api(config, `${base}/actions/runs/${runId}`)
      : (await api(config, `${base}/actions/workflows/${workflowFile}/runs?per_page=5`))
          .workflow_runs.find(
            (entry) =>
              entry.event === "workflow_dispatch" &&
              new Date(entry.created_at) >= startedAfter
          );

    if (run) {
      runId = run.id;
      onProgress?.(run, attempt);
      if (run.status === "completed") {
        if (run.conclusion === "success" || (allowFailure && run.conclusion === "failure")) {
          return run;
        }
        throw new Error(`${failureLabel} failed: ${run.html_url}`);
      }
    }

    await sleep(pollDelay(attempt));
  }

  throw new Error(`Timed out waiting for ${failureLabel.toLowerCase()}. Check GitHub Actions for status.`);
}

async function waitForWorkflow(config, startedAfter, onProgress) {
  return waitForDispatchedRun(
    config,
    WORKFLOW_PUBLISH,
    startedAfter,
    onProgress,
    90,
    "Publish workflow"
  );
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
  const base = repoApiBase(config);
  const ref = encodeURIComponent(config.branch);
  let sha;
  try {
    const existing = await api(config, `${base}/contents/${repoPath}?ref=${ref}`);
    sha = existing.sha;
  } catch (error) {
    if (!String(error.message).includes("404")) throw error;
  }

  try {
    await api(config, `${base}/contents/${repoPath}`, {
      method: "PUT",
      body: JSON.stringify({
        message,
        content: base64Content,
        branch: config.branch,
        ...(sha ? { sha } : {}),
      }),
    });
  } catch (error) {
    if (String(error.message).includes("Changes must be made through a pull request")) {
      throw new Error(
        "409: This branch is protected. In Social Studio settings, set Branch to studio (not master)."
      );
    }
    throw error;
  }
}

function getConfigFromForm() {
  return {
    token: $("github-token").value.trim(),
    owner: $("github-owner").value.trim() || DEFAULTS.owner,
    repo: $("github-repo").value.trim() || DEFAULTS.repo,
    branch: $("github-branch").value.trim() || DEFAULTS.branch,
  };
}

function configCacheKey(config) {
  return `${config.owner}/${config.repo}@${config.branch}`;
}

function loadScheduledCache(config) {
  try {
    const cached = JSON.parse(sessionStorage.getItem(SCHEDULED_CACHE_KEY) || "null");
    if (!cached || cached.key !== configCacheKey(config)) return null;
    if (Date.now() - cached.at > SCHEDULED_CACHE_TTL_MS) return null;
    return cached.posts;
  } catch {
    return null;
  }
}

function saveScheduledCache(config, posts) {
  try {
    sessionStorage.setItem(
      SCHEDULED_CACHE_KEY,
      JSON.stringify({ key: configCacheKey(config), at: Date.now(), posts })
    );
  } catch {
    // ignore quota errors
  }
}

function invalidateScheduledCache() {
  sessionStorage.removeItem(SCHEDULED_CACHE_KEY);
}

function rawMediaUrl(config, mediaPath) {
  return `https://raw.githubusercontent.com/${config.owner}/${config.repo}/${config.branch}/${mediaPath}`;
}

function selectedPlatforms() {
  return PLATFORMS.filter((platform) =>
    document.getElementById(`platform-${platform}`).checked
  );
}

function hideStatus(elementId) {
  const el = document.getElementById(elementId);
  el.classList.add("hidden");
  el.textContent = "";
  el.className = "status hidden";
}

function setStatus(elementId, message, type = "") {
  const el = document.getElementById(elementId);
  el.classList.remove("hidden");
  el.textContent = message;
  el.className = `status${type ? ` ${type}` : ""}`;
  el.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function setStep(step) {
  document.querySelectorAll(".step").forEach((node, index) => {
    const stepNum = index + 1;
    node.classList.remove("active", "done");
    node.removeAttribute("aria-current");
    if (stepNum < step) node.classList.add("done");
    if (stepNum === step) {
      node.classList.add("active");
      node.setAttribute("aria-current", "step");
    }
  });
  updateStepButtons(step);
}

function updateStepButtons(currentStep) {
  $("step-2").disabled = currentStep < 2 && !draft;
  $("step-3").disabled = !draft?.saved;
}

function showStep(step) {
  $("upload-section").classList.toggle("hidden", step !== 1);
  $("review-section").classList.toggle("hidden", step < 2);
  $("publish-section").classList.toggle("hidden", step < 3);
  setStep(step);
}

function setButtonLoading(btn, loading) {
  btn.disabled = loading;
  btn.classList.toggle("loading", loading);
}

function updateConnectionBadge() {
  const connected = Boolean(loadConfig().token);
  const badge = $("connection-badge");
  badge.textContent = connected ? "GitHub connected" : "Not connected";
  badge.classList.toggle("connected", connected);
  badge.classList.toggle("clickable", !connected);
  $("setup-banner").classList.toggle("hidden", connected);
}

function openSettingsPanel({ focusToken = false } = {}) {
  const panel = $("settings-section");
  panel.open = true;
  panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
  if (focusToken) {
    setTimeout(() => $("github-token").focus(), 300);
  }
}

function updateCaptionCount() {
  const caption = document.getElementById("caption").value;
  const countEl = document.getElementById("caption-count");
  const metaEl = countEl.closest(".field-meta");
  const len = caption.length;
  countEl.textContent = len.toLocaleString();
  metaEl.classList.toggle("near-limit", len > 2000);
  metaEl.classList.toggle("at-limit", len >= 2200);
}

function clearFieldErrors() {
  document.querySelectorAll(".field-error").forEach((el) => el.classList.remove("field-error"));
}

function markFieldError(id) {
  const el = document.getElementById(id);
  if (el) {
    el.classList.add("field-error");
    el.focus({ preventScroll: true });
  }
}

function showPublishProgress(message) {
  const el = document.getElementById("publish-progress");
  el.classList.remove("hidden");
  el.textContent = message;
}

function hidePublishProgress() {
  const el = document.getElementById("publish-progress");
  el.classList.add("hidden");
  el.textContent = "";
}

function showSuccessActions() {
  document.getElementById("success-actions").classList.remove("hidden");
}

function hideSuccessActions() {
  document.getElementById("success-actions").classList.add("hidden");
}

function resetForm() {
  draft = null;
  sessionStorage.removeItem(SESSION_KEY);
  clearFieldErrors();
  clearMediaPreview();
  hideSuccessActions();
  hidePublishProgress();
  hideStatus("upload-status");
  hideStatus("review-status");
  hideStatus("publish-status");

  document.getElementById("title").value = "";
  document.getElementById("caption").value = "";
  document.getElementById("hashtags").value = "";
  document.getElementById("event-name").value = "";
  document.getElementById("publish-immediate").checked = true;
  document.getElementById("publish-scheduled").checked = false;
  document.getElementById("publish-at").value = "";
  document.getElementById("dry-run").checked = true;
  document.getElementById("media-file").value = "";
  PLATFORMS.forEach((platform) => {
    document.getElementById(`platform-${platform}`).checked = true;
  });

  updateCaptionCount();
  toggleScheduleFields();
  showStep(1);
  document.getElementById("upload-section").scrollIntoView({ behavior: "smooth", block: "start" });
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
    publish_at: draft.publishAt || "",
    platforms: draft.platforms,
    title: draft.title,
    caption: draft.caption,
    hashtags: draft.hashtags,
    media: {},
    created_at: new Date().toISOString(),
  };

  if (draft.eventName) {
    post.event_name = draft.eventName;
  }

  if (draft.mediaType === "video") {
    post.media.video = draft.mediaPath;
  } else {
    post.media.image = draft.mediaPath;
  }

  return window.jsyaml.dump(post, { lineWidth: 120 });
}

function renderPreview(container, draft, mediaUrl) {
  const tags = draft.hashtags.map((tag) => `#${tag}`).join(" ");
  const platformTags = draft.platforms
    .map((p) => `<span class="tag platform">${PLATFORM_LABELS[p] ?? p}</span>`)
    .join("");
  let mediaHtml = "";

  if (draft.mediaType === "video") {
    mediaHtml = `<video controls src="${mediaUrl}"></video>`;
  } else {
    mediaHtml = `<img src="${mediaUrl}" alt="Post media" />`;
  }

  const scheduleTag = draft.publishAt
    ? `<span class="tag scheduled">Scheduled: ${escapeHtml(formatScheduleDisplay(draft.publishAt))}</span>`
    : "";
  const eventLine = draft.eventName
    ? `<p class="hint"><strong>Event:</strong> ${escapeHtml(draft.eventName)}</p>`
    : "";

  container.innerHTML = `
    <div class="preview-meta">${platformTags}${scheduleTag}</div>
    ${eventLine}
    <h3>${escapeHtml(draft.title)}</h3>
    <p class="caption-text">${escapeHtml(draft.caption)}</p>
    ${tags ? `<p class="hashtags">${escapeHtml(tags)}</p>` : ""}
    ${mediaHtml}
    <p class="post-id">Post ID: <code>${escapeHtml(draft.id)}</code></p>
  `;
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function validateDraftInput() {
  clearFieldErrors();
  const title = document.getElementById("title").value.trim();
  const caption = document.getElementById("caption").value.trim();
  const fileInput = document.getElementById("media-file");
  const platforms = selectedPlatforms();
  const file = fileInput.files?.[0];
  let schedule;

  try {
    schedule = readScheduleFromForm();
  } catch (error) {
    if (isScheduledMode()) {
      markFieldError("publish-at");
    }
    throw error;
  }

  if (!title) {
    markFieldError("title");
    throw new Error("Enter a title.");
  }
  if (!caption) {
    markFieldError("caption");
    throw new Error("Enter a caption.");
  }
  if (!file) {
    document.getElementById("dropzone").classList.add("field-error");
    throw new Error("Choose a photo or video to upload.");
  }
  if (platforms.length === 0) {
    throw new Error("Select at least one platform.");
  }
  if (file.size > 25 * 1024 * 1024) {
    document.getElementById("dropzone").classList.add("field-error");
    throw new Error("File is larger than 25 MB. Use a smaller file.");
  }

  document.getElementById("dropzone").classList.remove("field-error");

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
    publishAt: schedule.publishAt,
    eventName: schedule.eventName,
    saved: false,
  };
}

function updatePublishStepUI() {
  const scheduled = Boolean(draft?.publishAt);
  const heading = document.getElementById("publish-heading");
  const hint = document.getElementById("publish-hint");
  const summary = document.getElementById("schedule-summary");
  const publishBtn = document.getElementById("publish-btn");

  if (scheduled) {
    heading.textContent = "3. Schedule";
    hint.textContent =
      "Dry run verifies your post. Uncheck it to approve the schedule — the post will go live automatically when the date arrives.";
    summary.classList.remove("hidden");
    summary.innerHTML = `<strong>Scheduled for:</strong> ${escapeHtml(formatScheduleDisplay(draft.publishAt))}${
      draft.eventName ? ` · <strong>Event:</strong> ${escapeHtml(draft.eventName)}` : ""
    }`;
    publishBtn.textContent = "Schedule post";
  } else {
    heading.textContent = "3. Publish";
    hint.textContent = "Dry run checks everything without posting. Uncheck it to go live.";
    summary.classList.add("hidden");
    summary.innerHTML = "";
    publishBtn.textContent = "Publish to social media";
  }

  updateStepNavLabel();
}

function toggleScheduleFields() {
  const scheduled = isScheduledMode();
  document.getElementById("schedule-fields").classList.toggle("hidden", !scheduled);
  if (scheduled && !document.getElementById("publish-at").value) {
    document.getElementById("publish-at").value = defaultScheduleDatetime();
  }
  updateStepNavLabel();
}

async function fetchScheduledPosts(config, { force = false } = {}) {
  if (!force) {
    const cached = loadScheduledCache(config);
    if (cached) return cached;
  }

  const ref = encodeURIComponent(config.branch);
  const base = repoApiBase(config);
  let contents;
  try {
    contents = await api(config, `${base}/contents/content/posts?ref=${ref}`);
  } catch (error) {
    if (String(error.message).includes("404")) return [];
    throw error;
  }

  if (!Array.isArray(contents)) return [];

  const yamlEntries = contents.filter(
    (entry) => entry.name.endsWith(".yaml") && !entry.name.endsWith(".published.yaml")
  );

  const details = await Promise.all(
    yamlEntries.map((entry) => api(config, `${base}/contents/${entry.path}?ref=${ref}`))
  );

  const posts = [];
  for (const detail of details) {
    const post = window.jsyaml.load(base64ToText(detail.content));
    if (!post?.publish_at) continue;

    const due = Date.parse(post.publish_at);
    if (!Number.isFinite(due) || due <= Date.now()) continue;
    if (post.status !== "pending" && post.status !== "review") continue;

    posts.push({
      id: post.id,
      title: post.title || post.id,
      eventName: post.event_name || "",
      publishAt: post.publish_at,
      status: post.status,
      platforms: post.platforms || [],
      due,
    });
  }

  const sorted = posts.sort((a, b) => a.due - b.due);
  saveScheduledCache(config, sorted);
  return sorted;
}

function renderScheduledList(posts) {
  const list = document.getElementById("scheduled-list");
  const empty = document.getElementById("scheduled-empty");

  if (!posts.length) {
    list.innerHTML = "";
    empty.classList.remove("hidden");
    return;
  }

  empty.classList.add("hidden");
  list.innerHTML = posts
    .map(
      (post) => `
    <article class="scheduled-item" role="listitem">
      <div>
        <p class="scheduled-item-title">${escapeHtml(post.title)}</p>
        <p class="scheduled-item-meta">
          ${post.eventName ? `${escapeHtml(post.eventName)} · ` : ""}${escapeHtml(post.id)}
        </p>
      </div>
      <div class="scheduled-item-side">
        <p class="scheduled-item-date">${escapeHtml(formatScheduleDisplay(post.publishAt))}</p>
        <span class="scheduled-item-status ${post.status === "review" ? "review" : ""}">${post.status === "review" ? "Awaiting approval" : "Approved"}</span>
      </div>
    </article>
  `
    )
    .join("");
}

async function refreshScheduledPosts({ force = false } = {}) {
  const config = getConfigFromForm();
  const btn = $("refresh-scheduled");
  const empty = $("scheduled-empty");
  hideStatus("scheduled-status");

  if (!config.token) {
    renderScheduledList([]);
    empty.textContent = "Save your GitHub token in settings to see scheduled posts.";
    return;
  }

  const cached = !force ? loadScheduledCache(config) : null;
  if (cached) {
    renderScheduledList(cached);
    if (cached.length === 0) {
      empty.textContent = "No upcoming scheduled posts.";
    }
    return;
  }

  setButtonLoading(btn, true);
  try {
    const posts = await fetchScheduledPosts(config, { force });
    renderScheduledList(posts);
    if (posts.length === 0) {
      empty.textContent = "No upcoming scheduled posts.";
    } else {
      $("scheduled-section").open = true;
      setStatus("scheduled-status", `${posts.length} upcoming post${posts.length === 1 ? "" : "s"} found.`, "ok");
    }
  } catch (error) {
    setStatus("scheduled-status", error.message, "error");
  } finally {
    setButtonLoading(btn, false);
  }
}

let draft = null;
let previewUrl = null;

function revokePreviewUrl() {
  if (previewUrl) {
    URL.revokeObjectURL(previewUrl);
    previewUrl = null;
  }
}

function showMediaPreview(file) {
  const dropzone = $("dropzone");
  const empty = $("dropzone-empty");
  const preview = $("upload-preview");

  revokePreviewUrl();
  previewUrl = URL.createObjectURL(file);

  empty.classList.add("hidden");
  preview.classList.remove("hidden");
  dropzone.classList.add("has-file");

  const meta = `<p class="hint">${escapeHtml(file.name)} · ${formatFileSize(file.size)} · <button class="link-btn change-file-btn" type="button">Change file</button></p>`;
  if (isVideoFile(file)) {
    preview.innerHTML = `${meta}<video controls src="${previewUrl}"></video>`;
  } else {
    preview.innerHTML = `${meta}<img src="${previewUrl}" alt="Selected media" />`;
  }
}

function clearMediaPreview() {
  const dropzone = document.getElementById("dropzone");
  const empty = document.getElementById("dropzone-empty");
  const preview = document.getElementById("upload-preview");

  revokePreviewUrl();
  empty.classList.remove("hidden");
  preview.classList.add("hidden");
  preview.innerHTML = "";
  dropzone.classList.remove("has-file");
}

function updatePlatformsForMedia(file) {
  if (!file || isVideoFile(file)) return;
  for (const platform of IMAGE_AUTO_PLATFORMS) {
    document.getElementById(`platform-${platform}`).checked = true;
  }
}

function assignMediaFile(file) {
  const input = document.getElementById("media-file");
  const dt = new DataTransfer();
  dt.items.add(file);
  input.files = dt.files;
  document.getElementById("dropzone").classList.remove("field-error");
  showMediaPreview(file);
  updatePlatformsForMedia(file);
  hideStatus("upload-status");
}

$("open-settings-btn").addEventListener("click", () => openSettingsPanel({ focusToken: true }));

$("connection-badge").addEventListener("click", () => {
  if (!loadConfig().token) openSettingsPanel({ focusToken: true });
});

document.querySelectorAll(".step").forEach((btn) => {
  btn.addEventListener("click", () => {
    const target = Number(btn.dataset.step);
    if (btn.disabled) return;
    if (target === 1) {
      hideStatus("review-status");
      hideStatus("publish-status");
      showStep(1);
    } else if (target === 2 && draft) {
      hideStatus("publish-status");
      if (draft.file) {
        revokePreviewUrl();
        previewUrl = URL.createObjectURL(draft.file);
      }
      const config = getConfigFromForm();
      renderPreview(
        $("preview"),
        draft,
        previewUrl || `${rawMediaUrl(config, draft.mediaPath)}?t=${Date.now()}`
      );
      showStep(2);
    } else if (target === 3 && draft?.saved) {
      updatePublishStepUI();
      showStep(3);
    }
  });
});

document.getElementById("new-post-btn").addEventListener("click", resetForm);

document.getElementById("save-config").addEventListener("click", () => {
  const config = getConfigFromForm();
  if (!config.token) {
    setStatus("config-status", "GitHub token is required.", "error");
    markFieldError("github-token");
    return;
  }
  saveConfig(config);
  updateConnectionBadge();
  invalidateScheduledCache();
  setStatus("config-status", "Settings saved in this browser.", "ok");
  if ($("scheduled-section").open) {
    refreshScheduledPosts({ force: true });
  }
});

document.getElementById("toggle-token").addEventListener("click", () => {
  const input = document.getElementById("github-token");
  const btn = document.getElementById("toggle-token");
  const showing = input.type === "text";
  input.type = showing ? "password" : "text";
  btn.textContent = showing ? "Show" : "Hide";
  btn.setAttribute("aria-label", showing ? "Show token" : "Hide token");
});

document.getElementById("caption").addEventListener("input", () => {
  document.getElementById("caption").classList.remove("field-error");
  updateCaptionCount();
});

document.getElementById("title").addEventListener("input", () => {
  document.getElementById("title").classList.remove("field-error");
});

document.getElementById("publish-at").addEventListener("input", () => {
  document.getElementById("publish-at").classList.remove("field-error");
});

document.querySelectorAll('input[name="publish-timing"]').forEach((input) => {
  input.addEventListener("change", toggleScheduleFields);
});

$("refresh-scheduled").addEventListener("click", (event) => {
  event.preventDefault();
  event.stopPropagation();
  refreshScheduledPosts({ force: true });
});

document.getElementById("browse-btn").addEventListener("click", (event) => {
  event.stopPropagation();
  document.getElementById("media-file").click();
});

$("upload-preview").addEventListener("click", (event) => {
  if (event.target.closest(".change-file-btn")) {
    event.stopPropagation();
    $("media-file").click();
  }
});

$("dropzone").addEventListener("click", (event) => {
  if (event.target.closest("#browse-btn, .change-file-btn")) return;
  if (!$("dropzone").classList.contains("has-file")) {
    $("media-file").click();
  }
});

document.getElementById("dropzone").addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    if (!$("dropzone").classList.contains("has-file")) {
      $("media-file").click();
    }
  }
});

["dragenter", "dragover"].forEach((type) => {
  document.getElementById("dropzone").addEventListener(type, (event) => {
    event.preventDefault();
    event.stopPropagation();
    document.getElementById("dropzone").classList.add("dragover");
  });
});

["dragleave", "drop"].forEach((type) => {
  document.getElementById("dropzone").addEventListener(type, (event) => {
    event.preventDefault();
    event.stopPropagation();
    document.getElementById("dropzone").classList.remove("dragover");
  });
});

document.getElementById("dropzone").addEventListener("drop", (event) => {
  const file = event.dataTransfer?.files?.[0];
  if (file && (file.type.startsWith("image/") || file.type.startsWith("video/"))) {
    assignMediaFile(file);
  } else {
    setStatus("upload-status", "Please drop an image or video file.", "error");
  }
});

document.getElementById("media-file").addEventListener("change", () => {
  const file = document.getElementById("media-file").files?.[0];
  if (!file) {
    clearMediaPreview();
    return;
  }
  showMediaPreview(file);
  updatePlatformsForMedia(file);
});

document.getElementById("review-btn").addEventListener("click", () => {
  hideStatus("upload-status");
  try {
    draft = validateDraftInput();
    revokePreviewUrl();
    previewUrl = URL.createObjectURL(draft.file);
    renderPreview(document.getElementById("preview"), draft, previewUrl);
    showStep(2);
    setStatus("review-status", "Check everything looks correct, then save to GitHub.", "ok");
  } catch (error) {
    setStatus("upload-status", error.message, "error");
    const firstError = document.querySelector(".field-error");
    if (firstError) {
      firstError.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }
});

document.getElementById("back-btn").addEventListener("click", () => {
  hideStatus("review-status");
  showStep(1);
});

document.getElementById("save-btn").addEventListener("click", async () => {
  const config = getConfigFromForm();
  if (!config.token) {
    setStatus("review-status", "Save your GitHub token in settings first.", "error");
    openSettingsPanel({ focusToken: true });
    return;
  }
  if (!draft) {
    setStatus("review-status", "Nothing to save.", "error");
    return;
  }

  const btn = document.getElementById("save-btn");
  setButtonLoading(btn, true);
  setStatus("review-status", "Uploading media and post to GitHub…");

  try {
    const mediaBase64 = await fileToBase64(draft.file);
    await uploadFile(config, draft.mediaPath, mediaBase64, `content: upload media for ${draft.id}`);

    const yaml = buildPostYaml(draft);
    await uploadFile(
      config,
      `content/posts/${draft.id}.yaml`,
      textToBase64(yaml),
      `content: draft post ${draft.id}`
    );

    draft.saved = true;
    invalidateScheduledCache();
    saveDraft({ ...draft, fileName: draft.file.name, file: null });

    showStep(3);
    updatePublishStepUI();
    hideSuccessActions();
    setStatus(
      "review-status",
      draft.publishAt
        ? "Saved to GitHub. Ready to schedule."
        : "Saved to GitHub. Ready to publish.",
      "ok"
    );
  } catch (error) {
    setStatus("review-status", error.message, "error");
  } finally {
    setButtonLoading(btn, false);
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
  const scheduled = Boolean(draft.publishAt);
  setButtonLoading(btn, true);
  hideSuccessActions();
  hidePublishProgress();
  setStatus(
    "publish-status",
    dryRun
      ? "Running dry run…"
      : scheduled
        ? "Approving schedule…"
        : "Publishing to your platforms…"
  );

  try {
    const startedAt = new Date(Date.now() - 5000);
    await dispatchWorkflow(config, {
      post_id: draft.id,
      dry_run: dryRun,
      publish: true,
    });
    showPublishProgress("Workflow started on GitHub…");

    const progressLink = (run) =>
      run?.html_url
        ? ` <a href="${run.html_url}" target="_blank" rel="noopener">View on GitHub</a>`
        : "";

    await waitForWorkflow(config, startedAt, (activeRun, attempt) => {
      const elapsed = Math.round(
        Array.from({ length: attempt + 1 }, (_, i) => pollDelay(i)).reduce((a, b) => a + b, 0) / 1000
      );
      if (activeRun.status === "in_progress" || activeRun.status === "queued") {
        $("publish-progress").innerHTML =
          `Running on GitHub (${elapsed}s)…${progressLink(activeRun)}`;
        $("publish-progress").classList.remove("hidden");
      }
    });

    hidePublishProgress();
    setStatus(
      "publish-status",
      dryRun
        ? scheduled
          ? "Dry run passed. Uncheck dry run and schedule again to confirm."
          : "Dry run passed. Uncheck dry run and publish again to go live."
        : scheduled
          ? `Scheduled for ${formatScheduleDisplay(draft.publishAt)}. It will publish automatically when due.`
          : "Published to your selected platforms.",
      "ok"
    );

    if (!dryRun) {
      showSuccessActions();
      sessionStorage.removeItem(SESSION_KEY);
      draft = null;
      updateStepButtons(3);
      if (scheduled) {
        refreshScheduledPosts({ force: true });
      }
    }
  } catch (error) {
    hidePublishProgress();
    const linkMatch = String(error.message).match(/(https:\/\/github\.com\S+)/);
    if (linkMatch) {
      setStatus(
        "publish-status",
        `${error.message.replace(linkMatch[0], "").trim()} Open the workflow run on GitHub for details.`,
        "error"
      );
    } else {
      setStatus("publish-status", error.message, "error");
    }
  } finally {
    setButtonLoading(btn, false);
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
  updateConnectionBadge();
  updateCaptionCount();

  const saved = loadDraft();
  if (saved?.saved) {
    draft = saved;
    document.getElementById("title").value = saved.title || "";
    document.getElementById("caption").value = saved.caption || "";
    document.getElementById("hashtags").value = (saved.hashtags || []).join(", ");
    updateCaptionCount();
    PLATFORMS.forEach((platform) => {
      document.getElementById(`platform-${platform}`).checked = (saved.platforms || []).includes(platform);
    });
    if (saved.publishAt) {
      document.getElementById("publish-scheduled").checked = true;
      document.getElementById("publish-immediate").checked = false;
      document.getElementById("publish-at").value = toDatetimeLocalValue(new Date(saved.publishAt));
      document.getElementById("event-name").value = saved.eventName || "";
      toggleScheduleFields();
    }
    renderPreview(
      $("preview"),
      saved,
      `${rawMediaUrl(config, saved.mediaPath)}?t=${Date.now()}`
    );
    showStep(3);
    updatePublishStepUI();
    setStatus(
      "review-status",
      saved.publishAt
        ? `Restored scheduled post "${saved.id}". You can confirm the schedule.`
        : `Restored saved post "${saved.id}". You can publish again.`,
      "ok"
    );
  }

  toggleScheduleFields();

  const scheduledPanel = $("scheduled-section");
  scheduledPanel.addEventListener("toggle", () => {
    if (scheduledPanel.open) refreshScheduledPosts();
  });

  if (!config.token) {
    openSettingsPanel();
  }

  if (window.CredentialsHealth) {
    CredentialsHealth.init({
      api,
      getConfig: getConfigFromForm,
      authHeaders,
      sleep,
      setButtonLoading,
      waitForDispatchedRun,
      pollDelay,
      repoApiBase,
    });
  }
});
