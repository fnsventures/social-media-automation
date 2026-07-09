# Media Upload & Publishing Guide

This guide walks you through uploading a photo or video and publishing it to Facebook, Instagram, YouTube, WhatsApp Status, and Google Business — even if you have never used this system before.

**Live dashboard:** [Social Studio on GitHub Pages](https://fnsventures.github.io/social-media-automation/)

---

## Table of contents

1. [What this system does](#what-this-system-does)
2. [Before you start (one-time setup)](#before-you-start-one-time-setup)
3. [Upload and publish media (step by step)](#upload-and-publish-media-step-by-step)
4. [Supported media formats and limits](#supported-media-formats-and-limits)
5. [What happens after you click Publish](#what-happens-after-you-click-publish)
6. [Alternative: upload from the command line](#alternative-upload-from-the-command-line)
7. [Troubleshooting expired or invalid tokens](#troubleshooting-expired-or-invalid-tokens)
8. [Credential renewal overview](#credential-renewal-overview)
9. [Quick reference: where every credential lives](#quick-reference-where-every-credential-lives)
10. [Getting help from workflow logs](#getting-help-from-workflow-logs)

**Google Business social profile links:** [GOOGLE_BUSINESS_SOCIAL_LINKS.md](GOOGLE_BUSINESS_SOCIAL_LINKS.md) — link Facebook/Instagram on GBP, social media updates carousel, expired token recovery.

**All token expiry / renewal:** [CREDENTIAL_RECOVERY.md](CREDENTIAL_RECOVERY.md) — `npm run verify` and `npm run verify:fix` for every platform.

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

1. Open [Social Studio](https://fnsventures.github.io/social-media-automation/) in Chrome, Firefox, or Edge.
2. Expand **GitHub connection** at the top of the page.

### Step 1 — Connect GitHub

| Field | What to enter |
|-------|---------------|
| **GitHub owner** | Your GitHub username or organization (e.g. `fnsventures`) |
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
| **Publish Social Posts** | Daily at 6:00 AM IST (and manual trigger) | Publishes scheduled `pending` posts |

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

> **Administrators:** For a full renewal walkthrough (where credentials live, how to regenerate each one, and exactly which GitHub Secrets to update), see [Credential renewal overview](#credential-renewal-overview) below.

### How to confirm which credential failed

**Option A — Social Studio:** The publish step shows an error with a link to the failed workflow run.

**Option B — GitHub Actions:**

1. Go to [Actions](https://github.com/fnsventures/social-media-automation/actions) in your repository.
2. Open the failed **Approve and Publish** run.
3. Expand the **Publish pipeline** step and read the error message.

**Option C — Local verification (administrators):**

```bash
npm run verify
```

This tests each platform and prints `OK`, `FAIL`, or `MISSING`.

### Local verify passes but GitHub Actions fails

If `npm run verify` succeeds on your laptop but a dry run or publish fails in GitHub Actions with errors like `invalid_grant`, the **GitHub Repository Secrets are out of date** — they do not match your working local `.env`.

**What to do**

1. Run `npm run verify` locally and confirm all platforms show **OK**.
2. Open your local `.env` file (never commit this file).
3. For each platform that failed in CI, copy the matching values from `.env` into GitHub Secrets (see [How to update GitHub Secrets](#how-to-update-github-secrets)).
4. Re-run the failed workflow or click **Publish** again in Social Studio.

**Common mismatch:** `YOUTUBE_REFRESH_TOKEN` or `GOOGLE_BUSINESS_REFRESH_TOKEN` was renewed locally but the old value is still in GitHub Secrets.

---

## Credential renewal overview

This section is the detailed guide for administrators. Every platform credential is stored in up to **three places**. When something expires, you regenerate it locally, then copy the new value to every place that needs it.

### Where credentials live

| Location | Who uses it | How to update |
|----------|-------------|---------------|
| **Social Studio (browser)** | Uploading files to GitHub | Paste a new GitHub PAT in **GitHub connection** → **Save settings** |
| **Local `.env` file** | `npm run verify`, local CLI publish | Edit `.env` in the project root, or run a setup script (it updates `.env` automatically) |
| **GitHub Repository Secrets** | GitHub Actions (dry run + live publish) | Repository → **Settings → Secrets and variables → Actions** |

Direct link to secrets (replace `<owner>` with your GitHub username or org):

`https://github.com/<owner>/social-media-automation/settings/secrets/actions`

> **Important:** GitHub Actions **never** reads your local `.env`. After renewing a token locally, you **must** also update the matching GitHub Secret or CI will keep failing.

### Standard renewal workflow

Use this checklist every time a credential expires:

```
1. Run: npm run verify           # see which platform shows FAIL
2. Run: npm run verify:fix       # optional — offers to run setup scripts automatically
3. Or run the setup command manually (see table below)
4. Run: npm run verify           # all affected platforms should show OK
5. Update GitHub Secrets with the new values (see next section)
6. Re-run the failed GitHub Actions workflow
```

Quick reference for all tokens: **[CREDENTIAL_RECOVERY.md](CREDENTIAL_RECOVERY.md)**

### How to update GitHub Secrets

1. Open your repository on GitHub.
2. Go to **Settings** (repo settings, not your profile).
3. In the left sidebar, open **Secrets and variables → Actions**.
4. Under **Repository secrets**, find the secret name (e.g. `YOUTUBE_REFRESH_TOKEN`).
5. Click the secret name → **Update secret** → paste the new value → **Save secret**.
6. Repeat for every secret that changed (setup scripts print the full list at the end).

To add a secret that does not exist yet, click **New repository secret**, enter the **Name** exactly as shown in the tables below (case-sensitive), paste the value, and click **Add secret**.

### Renewal commands and secrets to update

Run **`npm run verify`** to check all platforms. Run **`npm run verify:fix`** to see fix steps and optionally run renewal scripts interactively.

See **[CREDENTIAL_RECOVERY.md](CREDENTIAL_RECOVERY.md)** for the full quick-reference table.

| Platform | Regenerate with | Update in `.env` | Update in GitHub Secrets |
|----------|-----------------|------------------|--------------------------|
| GitHub (Social Studio) | [Create new PAT](https://github.com/settings/tokens) | — | — (browser only) |
| Facebook + Instagram | `npm run setup:meta` | `META_PAGE_ACCESS_TOKEN`, `META_PAGE_ID`, `INSTAGRAM_BUSINESS_ACCOUNT_ID` | Same three names |
| YouTube (video upload) | `npm run setup:youtube` | `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, `YOUTUBE_REFRESH_TOKEN` | Same three names |
| YouTube Community (image) | `npm run setup:youtube-cookies` | `YOUTUBE_CHANNEL_ID`, `YOUTUBE_COOKIES_JSON` | Same two names |
| WhatsApp Status | `npm run setup:whatsapp` + export | `WHATSAPP_AUTH_B64`, `WHATSAPP_BUSINESS_NUMBER` | `WHATSAPP_AUTH_B64` (+ audience secrets if changed) |
| Google Business | `npm run setup:google-business` | `GOOGLE_BUSINESS_CLIENT_ID`, `GOOGLE_BUSINESS_CLIENT_SECRET`, `GOOGLE_BUSINESS_REFRESH_TOKEN`, `GOOGLE_BUSINESS_LOCATION_NAME`, `GOOGLE_BUSINESS_MEDIA_BASE_URL` | Same five names |
| Google Business social links | `npm run setup:google-business-social` | Uses same `GOOGLE_BUSINESS_*` secrets; optional URL overrides in `.env` only | Same five `GOOGLE_BUSINESS_*` names |

See **[CREDENTIAL_RECOVERY.md](CREDENTIAL_RECOVERY.md)** for a one-page table of every token and `npm run verify:fix`.

### How long credentials last (typical)

| Credential | Typical lifetime | Triggers renewal |
|------------|------------------|------------------|
| GitHub PAT (Social Studio) | 30–90 days (you choose at creation) | Expiration date, revoked token, scope change |
| Meta Page access token | Months to years (long-lived) | Password change, app access revoked, Meta session invalidated |
| YouTube OAuth refresh token | Long-lived until revoked | App removed at [myaccount.google.com/permissions](https://myaccount.google.com/permissions), OAuth client secret regenerated, `invalid_grant` in logs |
| YouTube Community cookies | Days to weeks | YouTube session logout, cookie expiry, Community post failures |
| WhatsApp linked-device session | Weeks to months | Phone offline too long, session removed in **Linked devices**, WhatsApp forced re-login |
| Google Business refresh token | Long-lived until revoked | Same as YouTube OAuth — revoke app access or regenerate client secret |

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
2. Generate a **new classic token** with these scopes:
   - **repo** (or **Contents: Read and write**)
   - **workflow** (or **Actions: Read and write**)
3. Copy the token immediately (GitHub shows it only once).
4. Open Social Studio → expand **GitHub connection**.
5. Paste the new token in the **GitHub token** field.
6. Click **Save settings** (stored in your browser only — not in GitHub Secrets).
7. Try **Save to GitHub** again.

**Where to update:** Social Studio browser only. GitHub Repository Secrets are **not** used for the Social Studio PAT.

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

1. On a machine with the repo cloned and Node.js 20+ installed:

   ```bash
   cd social-media-automation
   npm install
   # Ensure META_APP_ID and META_APP_SECRET are in .env (from Meta Developer Dashboard)
   npm run setup:meta
   ```

2. Log in with Facebook when the browser opens and approve permissions for your Page.
3. The script saves new values to `.env` and prints what to copy to GitHub.

4. **Update local `.env`** — the setup script does this automatically. Confirm these variables are set:

   | Variable | Description |
   |----------|-------------|
   | `META_PAGE_ACCESS_TOKEN` | Long-lived Page access token |
   | `META_PAGE_ID` | Numeric Facebook Page ID |
   | `INSTAGRAM_BUSINESS_ACCOUNT_ID` | Instagram Business account ID |

5. **Update GitHub Secrets** — for each variable above, go to **Settings → Secrets and variables → Actions** and update (or create) the secret with the **exact same name**.

6. Verify:

   ```bash
   npm run verify
   ```

   You should see `Facebook connected to "..."` and `Instagram connected as @...`.

7. Re-run the failed **Approve and Publish** workflow in GitHub Actions.

**Notes**

- Meta Page tokens are long-lived but can expire if the user changes their password, revokes app access, or Meta invalidates the session.
- Your Instagram account must be a **Business** or **Creator** account linked to the Facebook Page.

**Useful links**

- [Meta for Developers](https://developers.facebook.com/)
- [Facebook Login documentation](https://developers.facebook.com/docs/facebook-login/)

---

### Facebook — "Please reduce the amount of data you're asking for"

**Symptoms**

- Facebook fails during publish but Instagram succeeds on the same post
- Error: `Please reduce the amount of data you're asking for, then retry your request`
- The post may or may not appear on your Facebook Page despite the error

**Likely cause**

This is a known intermittent Meta API error, often triggered when Facebook and Instagram upload the same image to your Page at the same time. The publish pipeline now runs Instagram before Facebook to reduce conflicts.

**How to fix**

1. Check your Facebook Page — the post may have published despite the error.
2. If it did not publish, re-run the workflow for the pending post (no need to re-upload media).
3. If it keeps failing, wait a few minutes and retry (Meta-side capacity issue).
4. Ensure the image is under 10 MB.

**Where it is stored**

Same Meta credentials as Facebook + Instagram — see [Meta section](#meta-facebook--instagram--page-access-token-expired-or-invalid).

---

### YouTube — refresh token invalid or revoked

**Symptoms**

- `Could not refresh YouTube access token`
- Bare `invalid_grant` in the **Publish pipeline** log (often right after `Instagram connected as @...`)
- YouTube shows **FAIL** in `npm run verify`
- Dry run passes locally but fails in GitHub Actions

**Where it is stored**

| Location | Variable / Secret |
|----------|-------------------|
| GitHub Secrets | `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, `YOUTUBE_REFRESH_TOKEN` |
| Local `.env` file | Same variable names |
| Google Cloud Console | [console.cloud.google.com/apis/credentials](https://console.cloud.google.com/apis/credentials) |

**When it expires**

YouTube uses a long-lived **refresh token**, not a short-lived access token. It does not expire on a fixed schedule, but Google returns `invalid_grant` when:

- You revoked the app at [myaccount.google.com/permissions](https://myaccount.google.com/permissions)
- The OAuth **client secret** was regenerated in Google Cloud Console
- The refresh token was issued for a different `YOUTUBE_CLIENT_ID` / `YOUTUBE_CLIENT_SECRET` pair than what is in GitHub Secrets
- The Google account password was changed and sessions were invalidated (less common)

**How to fix**

1. Ensure **YouTube Data API v3** is enabled in [Google Cloud Console](https://console.cloud.google.com/apis/library/youtube.googleapis.com).

2. On your setup machine:

   ```bash
   cd social-media-automation
   npm install
   # Ensure YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET are in .env
   npm run setup:youtube
   ```

3. Sign in with the **Google account that owns the YouTube channel** when the browser opens. If you do not get a refresh token, revoke prior access at [myaccount.google.com/permissions](https://myaccount.google.com/permissions) and run setup again.

4. **Update local `.env`** — the script writes:

   | Variable | Description |
   |----------|-------------|
   | `YOUTUBE_CLIENT_ID` | OAuth client ID from Google Cloud |
   | `YOUTUBE_CLIENT_SECRET` | OAuth client secret from Google Cloud |
   | `YOUTUBE_REFRESH_TOKEN` | New long-lived refresh token (long string starting with `1//`) |

5. **Update GitHub Secrets** — update all three secrets above. If you only update `YOUTUBE_REFRESH_TOKEN` but the client ID/secret in GitHub are old, you will still get `invalid_grant`.

6. Verify locally:

   ```bash
   npm run verify
   ```

   Expected output includes: `YouTube connected as "upload access ready"`.

7. Re-run the dry run in GitHub Actions (**Approve and Publish** workflow with **Dry run** checked).

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

7. **Update local `.env`** — the script writes:

   | Variable | Description |
   |----------|-------------|
   | `YOUTUBE_CHANNEL_ID` | Channel ID starting with `UC...` |
   | `YOUTUBE_COOKIES_JSON` | Full JSON array from Cookie-Editor (one long line is fine) |

8. **Update GitHub Secrets** — paste the same values into `YOUTUBE_CHANNEL_ID` and `YOUTUBE_COOKIES_JSON`. For `YOUTUBE_COOKIES_JSON`, paste the **entire** JSON array; do not wrap it in extra quotes.

9. Verify:

   ```bash
   npm run verify
   ```

   Expected: `YouTube connected as "Community tab ready (UC...)"`.

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
   cd social-media-automation
   npm install
   # Set WHATSAPP_BUSINESS_NUMBER in .env (country code, no +)
   # Example: 919668913299 for +91 96689 13299
   rm -rf whatsapp-auth   # only if re-linking from scratch
   npm run setup:whatsapp
   ```

2. On the **business phone**, open WhatsApp → **Settings → Linked devices → Link a device**.
3. Scan the QR code shown in the terminal.

4. **Export session for GitHub Actions:**

   ```bash
   # macOS — copies base64 archive to clipboard
   tar -czf - whatsapp-auth | base64 | pbcopy

   # Linux
   tar -czf - whatsapp-auth | base64 -w0
   ```

   Or use the helper script:

   ```bash
   npm run export:whatsapp-auth
   ```

5. **Update local `.env`:**

   | Variable | Description |
   |----------|-------------|
   | `WHATSAPP_AUTH_B64` | Base64 output from the export command |
   | `WHATSAPP_BUSINESS_NUMBER` | Business phone, country code, no `+` |

6. **Update GitHub Secrets** — at minimum update `WHATSAPP_AUTH_B64`. Also confirm `WHATSAPP_BUSINESS_NUMBER`, `WHATSAPP_STATUS_AUDIENCE`, and `WHATSAPP_STATUS_CONTACTS` match your `.env`.

7. Verify locally:

   ```bash
   npm run verify
   ```

8. Re-run the failed workflow in GitHub Actions.

**Notes**

- WhatsApp sessions expire if the phone is offline for a long time, the session is revoked in **Linked devices**, or WhatsApp forces a re-login.
- Always scan the QR with the phone number configured in `WHATSAPP_BUSINESS_NUMBER`.

---

### Google Business Profile — refresh token invalid or API access issue

**Symptoms**

- Google Business verification failed in `npm run verify`
- Verify passes but publish fails with `Google My Business API has not been used ... or it is disabled`
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
3. On your setup machine:

   ```bash
   cd social-media-automation
   npm install
   # GOOGLE_BUSINESS_CLIENT_ID / SECRET can match YOUTUBE_CLIENT_ID / SECRET
   npm run setup:google-business
   ```

4. Sign in with the Google account that manages the business and select your location.

5. **Update local `.env`** — the script writes:

   | Variable | Description |
   |----------|-------------|
   | `GOOGLE_BUSINESS_CLIENT_ID` | OAuth client ID (can reuse YouTube client) |
   | `GOOGLE_BUSINESS_CLIENT_SECRET` | OAuth client secret |
   | `GOOGLE_BUSINESS_REFRESH_TOKEN` | Long-lived refresh token |
   | `GOOGLE_BUSINESS_LOCATION_NAME` | Resource name like `accounts/123/locations/456` |
   | `GOOGLE_BUSINESS_MEDIA_BASE_URL` | Public URL prefix for `media/` files |

6. **Update GitHub Secrets** — update all five variables above with the **exact same names**.

7. Verify:

   ```bash
   npm run verify
   ```

   Expected: `Google Business connected to "Your Business Name"`.

8. Re-run the failed workflow in GitHub Actions.

**How to fix (Google My Business API not enabled)**

If verification passes but publish fails with a message like:

`Google My Business API has not been used in project ... before or it is disabled`

then the **posting** API is disabled even though the **location lookup** API works. Enable all three in the same Google Cloud project used for OAuth:

1. Open [Google My Business API](https://console.cloud.google.com/apis/library/mybusiness.googleapis.com) → **Enable**
2. Open [My Business Account Management API](https://console.cloud.google.com/apis/library/mybusinessaccountmanagement.googleapis.com) → **Enable**
3. Open [My Business Business Information API](https://console.cloud.google.com/apis/library/mybusinessbusinessinformation.googleapis.com) → **Enable**

Use the project number from the error message (e.g. `209187085216`) if you have multiple Google Cloud projects.

4. Wait 2–5 minutes for Google to propagate the change.
5. Verify locally:

   ```bash
   npm run verify
   ```

   If posting API access is still missing, verify will now fail with a clear message instead of only failing at publish time.

6. Re-run the publish workflow for the pending post.

**How to fix (social profile links / Social media updates carousel)**

If Instagram or Facebook posts are not appearing in the **Social media updates** section on Google Search/Maps, or you need to link profiles when the dashboard has no **Social profiles** field:

1. Read the full guide: **[GOOGLE_BUSINESS_SOCIAL_LINKS.md](GOOGLE_BUSINESS_SOCIAL_LINKS.md)**

2. Check current links (no changes):

   ```bash
   npm run check:google-business-social
   ```

3. Link or refresh profiles:

   ```bash
   npm run setup:google-business-social
   ```

4. If Google token expired:

   ```bash
   npm run setup:google-business-social -- --fix
   ```

   Choose **Yes** when asked to run `npm run setup:google-business`, then copy updated values to GitHub Secrets (table above).

5. If Meta token expired but you only need to set URLs:

   - Option A: `npm run setup:meta` then re-run social setup
   - Option B: add to `.env` manually:

     ```bash
     GOOGLE_BUSINESS_FACEBOOK_URL=https://www.facebook.com/bishnupriyafuels
     GOOGLE_BUSINESS_INSTAGRAM_URL=https://www.instagram.com/bishnupriyafuels
     ```

6. Wait 24–72 hours after linking for Google to refresh the carousel.

**How to fix (image URL errors)**

Google fetches images from a public URL. Ensure:

- `GOOGLE_BUSINESS_MEDIA_BASE_URL` points to your raw GitHub files, e.g.:

  `https://raw.githubusercontent.com/<owner>/social-media-automation/master`

- The image file is committed and pushed **before** publish runs.
- The URL is reachable in a browser (paste the full image URL to test).

---

## Quick reference: where every credential lives

| Credential | Social Studio (browser) | Local `.env` | GitHub Secrets | How to renew | Secrets to update after renewal |
|------------|-------------------------|--------------|----------------|--------------|--------------------------------|
| GitHub PAT | Yes | No | No | [Create new token](https://github.com/settings/tokens) | — (paste in Social Studio only) |
| Meta Page token | No | Yes | Yes | `npm run setup:meta` | `META_PAGE_ACCESS_TOKEN`, `META_PAGE_ID`, `INSTAGRAM_BUSINESS_ACCOUNT_ID` |
| YouTube refresh token | No | Yes | Yes | `npm run setup:youtube` | `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, `YOUTUBE_REFRESH_TOKEN` |
| YouTube Community cookies | No | Yes | Yes | `npm run setup:youtube-cookies` | `YOUTUBE_CHANNEL_ID`, `YOUTUBE_COOKIES_JSON` |
| WhatsApp session | No | Yes (`whatsapp-auth/`) | Yes (`WHATSAPP_AUTH_B64`) | `npm run setup:whatsapp` | `WHATSAPP_AUTH_B64` |
| Google Business refresh token | No | Yes | Yes | `npm run setup:google-business` | `GOOGLE_BUSINESS_CLIENT_ID`, `GOOGLE_BUSINESS_CLIENT_SECRET`, `GOOGLE_BUSINESS_REFRESH_TOKEN`, `GOOGLE_BUSINESS_LOCATION_NAME`, `GOOGLE_BUSINESS_MEDIA_BASE_URL` |

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
| `invalid_grant` (after Instagram connected) | YouTube OAuth refresh token invalid in GitHub Secrets | [YouTube](#youtube--refresh-token-invalid-or-revoked) |
| `Could not refresh YouTube access token` | YouTube OAuth revoked | [YouTube](#youtube--refresh-token-invalid-or-revoked) |
| `invalid_grant` (after YouTube connected) | Google Business refresh token invalid | [Google Business](#google-business-profile--refresh-token-invalid-or-api-access-issue) |
| `Google My Business API has not been used` / `is disabled` | Posting API not enabled in Google Cloud | [Google Business API enable](#google-business-profile--refresh-token-invalid-or-api-access-issue) |
| `Please reduce the amount of data` (Facebook only) | Meta API conflict or transient error | [Facebook data error](#facebook--please-reduce-the-amount-of-data-youre-asking-for) |
| `WhatsApp auth not configured` | Missing or expired session | [WhatsApp](#whatsapp-status--session-expired-or-logged-out) |
| `Invalid YOUTUBE_COOKIES_JSON` | Malformed or expired cookies | [YouTube Community](#youtube-community--cookies-expired-image-posts) |
| `401` / `403` on GitHub API | GitHub PAT issue | [GitHub PAT](#github-personal-access-token-pat--expired-or-rejected) |
| Verify OK locally, FAIL in Actions | GitHub Secrets out of sync with `.env` | [Local vs CI mismatch](#local-verify-passes-but-github-actions-fails) |
| Google media fetch failed | Image not public yet | [Google Business URL](#google-business-profile--refresh-token-invalid-or-api-access-issue) |
| Social media updates missing / social links | Profiles not linked or token expired | [Social profile links](#how-to-fix-social-profile-links--social-media-updates-carousel) |

After updating any secret in GitHub, **re-run the failed workflow** or click **Publish** again in Social Studio. You do not need to re-upload media if it was already saved.

### Checklist after renewing any credential

- [ ] Setup script completed without errors
- [ ] `npm run verify` shows **OK** for the affected platform(s)
- [ ] Matching GitHub Secrets updated (names must match `.env` exactly)
- [ ] Failed GitHub Actions workflow re-run (or Social Studio publish retried)

---

## Related documentation

- [Main README](../README.md) — project overview, OAuth setup, CLI commands
- [Example post](../content/posts/example.yaml) — YAML format reference
- [Privacy policy](https://fnsventures.github.io/social-media-automation/privacy-policy.html) — required for Meta app review
