# Media Upload & Publishing Guide

This guide walks you through uploading a photo or video and publishing it to Facebook, Instagram, YouTube, WhatsApp Status, and Google Business — even if you have never used this system before.

**Live dashboard:** [Social Studio on GitHub Pages](https://privatefnsventures-maker.github.io/social-media-automation/)

---

## Table of contents

1. [What this system does](#what-this-system-does)
2. [Before you start (one-time setup)](#before-you-start-one-time-setup)
3. [Upload and publish media (step by step)](#upload-and-publish-media-step-by-step)
4. [Supported media formats and limits](#supported-media-formats-and-limits)
5. [What happens after you click Publish](#what-happens-after-you-click-publish)
6. [Alternative: upload from the command line](#alternative-upload-from-the-command-line)
7. [Troubleshooting expired or invalid tokens](#troubleshooting-expired-or-invalid-tokens)
8. [Quick reference: where every credential lives](#quick-reference-where-every-credential-lives)
9. [Getting help from workflow logs](#getting-help-from-workflow-logs)

---

## What this system does

Social Studio is a browser dashboard that:

1. Uploads your image or video to the GitHub repository (`media/` folder).
2. Creates a post file (`content/posts/your-post-id.yaml`) with your caption and selected platforms.
3. Triggers a GitHub Actions workflow that posts to your social accounts.

You do **not** need to install anything on your computer to upload media. You only need:

- A web browser
- A [GitHub Personal Access Token (PAT)](https://github.com/settings/tokens) with repository access
- Platform credentials already configured as **GitHub Repository Secrets** (set up once by an administrator)

---

## Before you start (one-time setup)

These steps are done once by a technical administrator. If publishing has worked before, you can skip to [Upload and publish media](#upload-and-publish-media-step-by-step).

### 1. Enable GitHub Pages

1. Open your repository on GitHub.
2. Go to **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to **GitHub Actions**.
4. The Social Studio dashboard will be available at:

   `https://<your-github-username-or-org>.github.io/social-media-automation/`

### 2. Create a GitHub Personal Access Token (for Social Studio)

Social Studio uses this token to save files to the repository. It is stored **only in your browser** — never in the repo.

1. Go to [github.com/settings/tokens](https://github.com/settings/tokens).
2. Click **Generate new token** → **Generate new token (classic)**.
3. Give it a name, e.g. `Social Studio`.
4. Set an expiration (90 days is common — see [GitHub PAT expired](#github-personal-access-token-pat--expired-or-rejected) when it expires).
5. Enable these scopes:
   - **repo** (or at minimum: **Contents: Read and write**)
   - **workflow** (or **Actions: Read and write**)
6. Click **Generate token** and copy it immediately (you will not see it again).

### 3. Configure platform credentials (GitHub Secrets)

Posting credentials are stored as **Repository Secrets**, not in the repository files.

1. Open your repository on GitHub.
2. Go to **Settings → Secrets and variables → Actions**.
3. Click **New repository secret** for each value below.

| Secret name | Used for |
|-------------|----------|
| `META_PAGE_ACCESS_TOKEN` | Facebook + Instagram posting |
| `META_PAGE_ID` | Facebook Page ID |
| `INSTAGRAM_BUSINESS_ACCOUNT_ID` | Instagram Business account |
| `YOUTUBE_CLIENT_ID` | YouTube OAuth |
| `YOUTUBE_CLIENT_SECRET` | YouTube OAuth |
| `YOUTUBE_REFRESH_TOKEN` | YouTube video uploads |
| `YOUTUBE_CHANNEL_ID` | YouTube Community image posts |
| `YOUTUBE_COOKIES_JSON` | YouTube Community session cookies |
| `WHATSAPP_AUTH_B64` | WhatsApp Status session |
| `WHATSAPP_BUSINESS_NUMBER` | WhatsApp business phone (no `+`) |
| `WHATSAPP_STATUS_AUDIENCE` | `all_contacts` or `contacts` |
| `WHATSAPP_STATUS_CONTACTS` | Optional viewer list |
| `GOOGLE_BUSINESS_CLIENT_ID` | Google Business OAuth |
| `GOOGLE_BUSINESS_CLIENT_SECRET` | Google Business OAuth |
| `GOOGLE_BUSINESS_REFRESH_TOKEN` | Google Business posting |
| `GOOGLE_BUSINESS_LOCATION_NAME` | Location resource name |
| `GOOGLE_BUSINESS_MEDIA_BASE_URL` | Public URL prefix for images |

See [OAuth setup in the main README](../README.md#4-oauth-setup-one-time) for how to generate each secret using the setup scripts.

### 4. Verify everything works

An administrator should run this locally (requires Node.js 20+):

```bash
git clone https://github.com/<owner>/social-media-automation.git
cd social-media-automation
npm install
cp .env.example .env
# Fill in the same values as GitHub Secrets
npm run verify
```

If all platforms show **OK**, you are ready to upload.

---

## Upload and publish media (step by step)

### Step 0 — Open Social Studio

1. Open [Social Studio](https://privatefnsventures-maker.github.io/social-media-automation/) in Chrome, Firefox, or Edge.
2. Expand **GitHub connection** at the top of the page.

### Step 1 — Connect GitHub

| Field | What to enter |
|-------|---------------|
| **GitHub owner** | Your GitHub username or organization (e.g. `privatefnsventures-maker`) |
| **Repository** | `social-media-automation` |
| **Branch** | Usually `master` or `main` — ask your admin if unsure |
| **GitHub token** | The PAT you created above (`github_pat_...`) |

Click **Save settings**. The badge in the header should change to **GitHub connected**.

> **Tip:** If you see `401` or `403` errors later, your GitHub token may be expired or missing permissions. See [GitHub PAT expired](#github-personal-access-token-pat--expired-or-rejected).

### Step 2 — Upload your post (Step 1 in the dashboard)

Fill in the form:

| Field | Guidance |
|-------|----------|
| **Title** | Short internal title (e.g. `Monsoon tyre care tips`). Used to generate the post ID. |
| **Caption** | The text that appears on your social posts. Up to 2,200 characters. |
| **Hashtags** | Comma-separated, without `#` (e.g. `BishnupriyaFuels, BPCL, Jajpur`). They are appended to the caption on publish. |
| **Media** | Drag and drop a photo or video, or click **Browse files**. Maximum size: **25 MB**. |
| **Platforms** | Check the platforms you want. When you upload an **image**, Instagram, YouTube, WhatsApp Status, and Google Business are selected automatically. |

Click **Review post** to continue.

### Step 3 — Review (Step 2 in the dashboard)

1. Check the preview — caption, hashtags, media, and selected platforms.
2. Note the **Post ID** shown at the bottom (e.g. `monsoon-tyre-care-1718123456789`). You will need this if you troubleshoot in GitHub Actions.
3. Click **Save to GitHub**.

This uploads two files to the repository:

- `media/<post-id>.jpg` (or `.png`, `.webp`, `.mp4`) — your media file
- `content/posts/<post-id>.yaml` — post metadata with status `review`

Wait until you see **Saved to GitHub. Ready to publish.**

### Step 4 — Publish (Step 3 in the dashboard)

1. **Always run a dry run first.** Keep **Dry run** checked and click **Publish**.
2. A GitHub Actions workflow runs. This validates your post and credentials **without** posting to social media.
3. If the dry run passes, you will see: *Dry run passed. Uncheck dry run and publish again to go live.*
4. **Uncheck Dry run** and click **Publish** again to post live.

> **Important for Google Business:** Google fetches images by public URL. Your media file must already be committed and pushed to GitHub before publish runs. Social Studio does this automatically when you click **Save to GitHub**.

---

## Supported media formats and limits

| Type | Formats | Max size (Social Studio) | Notes |
|------|---------|---------------------------|-------|
| Image | JPG, PNG, WebP | 25 MB | Recommended for Instagram and Google Business |
| Video | MP4, MOV, WebM | 25 MB | Required for Instagram if no image is provided |

### Platform-specific requirements

| Platform | Image | Video | Extra notes |
|----------|-------|-------|-------------|
| **Facebook** | Optional | Optional | At least one of image or video recommended |
| **Instagram** | Required *or* video | Required *or* image | One media type is mandatory |
| **YouTube** | Community tab (with cookies) or auto-converted short clip | Supported | Image-only posts need `YOUTUBE_COOKIES_JSON` for Community tab; otherwise ffmpeg converts image to a short video |
| **WhatsApp Status** | Supported | Supported | Posted from the linked business phone |
| **Google Business** | Supported (recommended 1200×900) | Not supported | Image must be publicly reachable via `GOOGLE_BUSINESS_MEDIA_BASE_URL` |

---

## What happens after you click Publish

```
Social Studio  →  GitHub repository  →  GitHub Actions  →  Social platforms
   (browser)        (media/ + YAML)     (workflow)         (Facebook, etc.)
```

### Post status lifecycle

| Status | Meaning |
|--------|---------|
| `review` | Just saved from Social Studio — waiting for approval |
| `pending` | Approved and ready to publish |
| `published` | Successfully posted; file archived as `*.published.yaml` |

### Workflows involved

| Workflow | When it runs | Purpose |
|----------|--------------|---------|
| **Approve and Publish** | When you click Publish in Social Studio | Verify, approve, and publish a single post |
| **Publish Social Posts** | Daily at 9:00 AM IST (and manual trigger) | Publishes scheduled `pending` posts |

You can monitor progress at:

`https://github.com/<owner>/social-media-automation/actions`

---

## Alternative: upload from the command line

If you prefer not to use Social Studio:

### 1. Add media and create a post file manually

```bash
# Copy your file into media/
cp ~/Downloads/my-photo.jpg media/my-photo.jpg
```

Create `content/posts/my-post.yaml` (see `content/posts/example.yaml`):

```yaml
id: my-post
status: pending
publish_at: ""
platforms:
  - facebook
  - instagram
  - youtube
  - whatsapp
  - google_business
title: My post title
caption: |
  Your caption text here.
hashtags:
  - BishnupriyaFuels
media:
  image: media/my-photo.jpg
```

### 2. Commit and push

```bash
git add media/my-photo.jpg content/posts/my-post.yaml
git commit -m "Add post my-post"
git push
```

### 3. Publish

```bash
# Validate first
npm run publish:dry-run -- --post my-post

# Publish live
npm run publish -- --post my-post
```

Or trigger the **Approve and Publish** workflow manually in GitHub Actions with `post_id: my-post`.

---

## Troubleshooting expired or invalid tokens

When a token or session expires, publishing fails. The error message usually names the platform. Use this section to identify which credential failed, where to find it, and how to fix it.

### How to confirm which credential failed

**Option A — Social Studio:** The publish step shows an error with a link to the failed workflow run.

**Option B — GitHub Actions:**

1. Go to [Actions](https://github.com/privatefnsventures-maker/social-media-automation/actions) in your repository.
2. Open the failed **Approve and Publish** run.
3. Expand the **Publish pipeline** step and read the error message.

**Option C — Local verification (administrators):**

```bash
npm run verify
```

This tests each platform and prints `OK`, `FAIL`, or `MISSING`.

---

### GitHub Personal Access Token (PAT) — expired or rejected

**Symptoms**

- `401 Bad credentials` or `403 Resource not accessible` when saving to GitHub
- Cannot upload media or post YAML to the repository

**Where it is stored**

- Social Studio → **GitHub connection** → **GitHub token** field (browser local storage only)
- Created at [github.com/settings/tokens](https://github.com/settings/tokens)

**How to fix**

1. Go to [github.com/settings/tokens](https://github.com/settings/tokens).
2. Generate a **new classic token** with **Contents: Read and write** and **Actions: Read and write**.
3. Open Social Studio → **GitHub connection**.
4. Paste the new token and click **Save settings**.
5. Try **Save to GitHub** again.

**Prevention:** Set a calendar reminder before the token's expiration date.

---

### Meta (Facebook + Instagram) — Page access token expired or invalid

**Symptoms**

- `Facebook Page token invalid`
- `Instagram token invalid`
- Meta verification failed in `npm run verify`
- Graph API errors mentioning `OAuthException`, `Error validating access token`, or code `190`

**Where it is stored**

| Location | Variable / Secret |
|----------|-------------------|
| GitHub Secrets | `META_PAGE_ACCESS_TOKEN`, `META_PAGE_ID`, `INSTAGRAM_BUSINESS_ACCOUNT_ID` |
| Local `.env` file | Same variable names |
| Meta Developer Dashboard | [developers.facebook.com](https://developers.facebook.com/) → your app |

**How to fix**

1. On a machine with the repo cloned and Node.js installed:

   ```bash
   # Ensure META_APP_ID and META_APP_SECRET are in .env
   npm run setup:meta
   ```

2. Log in with Facebook when the browser opens and approve permissions for your Page.
3. The script prints new values. Copy them to:
   - Local `.env` file
   - GitHub → **Settings → Secrets and variables → Actions** → update each secret
4. Verify:

   ```bash
   npm run verify
   ```

**Notes**

- Meta Page tokens are long-lived but can expire if the user changes their password, revokes app access, or Meta invalidates the session.
- Your Instagram account must be a **Business** or **Creator** account linked to the Facebook Page.

**Useful links**

- [Meta for Developers](https://developers.facebook.com/)
- [Facebook Login documentation](https://developers.facebook.com/docs/facebook-login/)

---

### YouTube — refresh token invalid or revoked

**Symptoms**

- `Could not refresh YouTube access token`
- YouTube verification failed in `npm run verify`
- Errors mentioning `invalid_grant` or revoked credentials

**Where it is stored**

| Location | Variable / Secret |
|----------|-------------------|
| GitHub Secrets | `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, `YOUTUBE_REFRESH_TOKEN` |
| Local `.env` file | Same variable names |
| Google Cloud Console | [console.cloud.google.com/apis/credentials](https://console.cloud.google.com/apis/credentials) |

**How to fix**

1. Ensure **YouTube Data API v3** is enabled in [Google Cloud Console](https://console.cloud.google.com/apis/library/youtube.googleapis.com).
2. Run the setup script:

   ```bash
   # Ensure YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET are in .env
   npm run setup:youtube
   ```

3. Sign in with the Google account that owns the YouTube channel.
4. Copy the new `YOUTUBE_REFRESH_TOKEN` to `.env` and GitHub Secrets.
5. Verify:

   ```bash
   npm run verify
   ```

**Notes**

- Refresh tokens can be revoked if you remove app access at [myaccount.google.com/permissions](https://myaccount.google.com/permissions).
- If you regenerate the OAuth client secret in Google Cloud, you must run setup again.

---

### YouTube Community — cookies expired (image posts)

**Symptoms**

- YouTube video uploads work, but **image** posts to the Community tab fail
- Errors about authentication, cookies, or Community post creation

**Where it is stored**

| Location | Variable / Secret |
|----------|-------------------|
| GitHub Secrets | `YOUTUBE_CHANNEL_ID`, `YOUTUBE_COOKIES_JSON` |
| Local `.env` file | Same variable names |
| Browser | YouTube login session (exported as JSON) |

**How to fix**

YouTube Community image posts use **browser session cookies**, not OAuth. Cookies expire regularly (often every few weeks).

1. Install the [Cookie-Editor](https://cookie-editor.com/) browser extension.
2. Sign in to [youtube.com](https://www.youtube.com) with the channel that should post.
3. Open Cookie-Editor → **Export** → **JSON**.
4. Save the JSON array to `youtube-cookies.json` in the repo root (this file is gitignored).
5. Run:

   ```bash
   npm run setup:youtube-cookies
   ```

6. Enter your channel ID (from YouTube Studio URL: `https://studio.youtube.com/channel/UC...`).
7. Update GitHub Secrets:
   - `YOUTUBE_CHANNEL_ID`
   - `YOUTUBE_COOKIES_JSON` (paste the full JSON array)

**Prevention:** Re-export cookies whenever Community posts start failing, even if video uploads still work.

---

### WhatsApp Status — session expired or logged out

**Symptoms**

- `WhatsApp auth not configured` or connection timeout
- `Logged out` or `401` errors during publish
- WhatsApp shows **FAIL** in `npm run verify`

**Where it is stored**

| Location | Variable / Secret |
|----------|-------------------|
| Local folder | `whatsapp-auth/` (created by setup; gitignored) |
| GitHub Secret | `WHATSAPP_AUTH_B64` (base64 archive of `whatsapp-auth/`) |
| `.env` | `WHATSAPP_BUSINESS_NUMBER`, `WHATSAPP_STATUS_AUDIENCE` |

**How to fix**

1. On the machine that will run setup:

   ```bash
   # Set WHATSAPP_BUSINESS_NUMBER in .env (country code, no +)
   # Example: 919668913299 for +91 96689 13299
   rm -rf whatsapp-auth   # only if re-linking from scratch
   npm run setup:whatsapp
   ```

2. On the **business phone**, open WhatsApp → **Settings → Linked devices → Link a device**.
3. Scan the QR code shown in the terminal.
4. For GitHub Actions, create a new auth archive:

   ```bash
   tar -czf - whatsapp-auth | base64 | pbcopy   # macOS — copies to clipboard
   # Linux: tar -czf - whatsapp-auth | base64 -w0
   ```

5. Update the `WHATSAPP_AUTH_B64` secret in GitHub.
6. Verify locally:

   ```bash
   npm run verify
   ```

**Notes**

- WhatsApp sessions expire if the phone is offline for a long time, the session is revoked in **Linked devices**, or WhatsApp forces a re-login.
- Always scan the QR with the phone number configured in `WHATSAPP_BUSINESS_NUMBER`.

---

### Google Business Profile — refresh token invalid or API access issue

**Symptoms**

- Google Business verification failed in `npm run verify`
- Errors mentioning `invalid_grant`, `PERMISSION_DENIED`, or quota
- Image posts fail with URL fetch errors

**Where it is stored**

| Location | Variable / Secret |
|----------|-------------------|
| GitHub Secrets | `GOOGLE_BUSINESS_CLIENT_ID`, `GOOGLE_BUSINESS_CLIENT_SECRET`, `GOOGLE_BUSINESS_REFRESH_TOKEN`, `GOOGLE_BUSINESS_LOCATION_NAME`, `GOOGLE_BUSINESS_MEDIA_BASE_URL` |
| Local `.env` file | Same variable names |
| Google Cloud Console | [console.cloud.google.com](https://console.cloud.google.com/) |

**How to fix (token expired)**

1. Confirm [Business Profile API access](https://support.google.com/business/contact/api_default) has been approved.
2. Enable these APIs in Google Cloud:
   - My Business Account Management API
   - My Business Business Information API
   - Google My Business API
3. Run:

   ```bash
   npm run setup:google-business
   ```

4. Sign in and select your business location.
5. Update all printed values in `.env` and GitHub Secrets.
6. Verify:

   ```bash
   npm run verify
   ```

**How to fix (image URL errors)**

Google fetches images from a public URL. Ensure:

- `GOOGLE_BUSINESS_MEDIA_BASE_URL` points to your raw GitHub files, e.g.:

  `https://raw.githubusercontent.com/<owner>/social-media-automation/master`

- The image file is committed and pushed **before** publish runs.
- The URL is reachable in a browser (paste the full image URL to test).

---

## Quick reference: where every credential lives

| Credential | Social Studio (browser) | Local `.env` | GitHub Secrets | How to renew |
|------------|-------------------------|--------------|----------------|--------------|
| GitHub PAT | Yes | No | No | [Create new token](https://github.com/settings/tokens) |
| Meta Page token | No | Yes | Yes | `npm run setup:meta` |
| YouTube refresh token | No | Yes | Yes | `npm run setup:youtube` |
| YouTube Community cookies | No | Yes | Yes | `npm run setup:youtube-cookies` |
| WhatsApp session | No | Yes (`whatsapp-auth/`) | Yes (`WHATSAPP_AUTH_B64`) | `npm run setup:whatsapp` |
| Google Business refresh token | No | Yes | Yes | `npm run setup:google-business` |

### GitHub Secrets location (all platforms)

```
Repository → Settings → Secrets and variables → Actions → Repository secrets
```

Direct link pattern:

`https://github.com/<owner>/social-media-automation/settings/secrets/actions`

### Local environment file

Administrators use `.env` in the project root (copy from `.env.example`). This file is **never** committed to Git.

---

## Getting help from workflow logs

When publish fails in Social Studio:

1. Click the workflow link in the error message, or go to **Actions** in the repository.
2. Open the latest **Approve and Publish** run for your post.
3. Click the **approve-publish** job.
4. Expand **Publish pipeline** (or **Verify post** for dry runs).
5. Read the last lines of the log — they usually name the platform and error.

Common log patterns:

| Log message | Likely cause | Fix section |
|-------------|--------------|-------------|
| `Facebook Page token invalid` | Meta token expired | [Meta](#meta-facebook--instagram--page-access-token-expired-or-invalid) |
| `Could not refresh YouTube access token` | YouTube OAuth revoked | [YouTube](#youtube--refresh-token-invalid-or-revoked) |
| `WhatsApp auth not configured` | Missing or expired session | [WhatsApp](#whatsapp-status--session-expired-or-logged-out) |
| `Invalid YOUTUBE_COOKIES_JSON` | Malformed or expired cookies | [YouTube Community](#youtube-community--cookies-expired-image-posts) |
| `401` / `403` on GitHub API | GitHub PAT issue | [GitHub PAT](#github-personal-access-token-pat--expired-or-rejected) |
| Google media fetch failed | Image not public yet | [Google Business URL](#google-business-profile--refresh-token-invalid-or-api-access-issue) |

After updating any secret in GitHub, **re-run the failed workflow** or click **Publish** again in Social Studio. You do not need to re-upload media if it was already saved.

---

## Related documentation

- [Main README](../README.md) — project overview, OAuth setup, CLI commands
- [Example post](../content/posts/example.yaml) — YAML format reference
- [Privacy policy](https://privatefnsventures-maker.github.io/social-media-automation/privacy-policy.html) — required for Meta app review
