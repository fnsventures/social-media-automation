# Social Media Automation

Cross-post content to **Facebook**, **Instagram**, **YouTube**, **WhatsApp Status**, and **Google Business** from a web dashboard or the command line.

Built for [Bishnupriya Fuels](https://bishnupriyafuels.fnsventures.in/) (BPCL outlet, Jajpur).

## Features

- **Social Studio** — browser dashboard on GitHub Pages to upload media, write captions, and publish
- **Multi-platform publishing** — one post YAML drives Facebook, Instagram, YouTube, WhatsApp Status, and Google Business
- **Review workflow** — posts go through `review` → `pending` → `published` before going live
- **Dry run** — validate credentials and media without posting
- **Scheduled publishing** — GitHub Actions runs daily for due `pending` posts
- **Image-to-video** — when only an image is provided and Community cookies are not set, YouTube gets an auto-generated short clip (requires ffmpeg)
- **YouTube Community** — image posts can go to the Community tab when cookies are configured
- **Google Business** — image updates to your Business Profile listing via the official API

## How it works

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────────┐
│  Social Studio  │────▶│  GitHub repo     │────▶│  GitHub Actions     │
│  (docs/)        │     │  content/posts/  │     │  Approve & Publish  │
│  Upload + Review│     │  media/          │     │  or daily schedule  │
└─────────────────┘     └──────────────────┘     └──────────┬──────────┘
                                                            │
                              ┌─────────────────────────────┼─────────────────────────────┐
                              ▼                             ▼                             ▼
                         Facebook                      Instagram                        YouTube                    WhatsApp Status
```

### Post lifecycle

| Status | Meaning |
|--------|---------|
| `draft` | Work in progress — not picked up by automation |
| `review` | Saved from Social Studio — awaiting approval |
| `pending` | Approved and ready to publish (immediately, or when `publish_at` is due) |
| `published` | Archived as `*.published.yaml` with platform result IDs |

### Social Studio workflow

1. Open **Social Studio** at `https://<owner>.github.io/social-media-automation/`
2. Connect GitHub (PAT with **Contents** and **Actions** read/write — stored in the browser only)
3. **Upload** your photo or video and write the caption
4. **Review** the post, then **Save to GitHub** (creates a `review` post + media file)
5. **Publish** — dry run first (recommended), then uncheck dry run to go live

Live dashboard: [privatefnsventures-maker.github.io/social-media-automation](https://privatefnsventures-maker.github.io/social-media-automation/)

### Full media upload guide

For a detailed, newcomer-friendly walkthrough — including step-by-step upload instructions, media requirements, and how to fix expired tokens — see:

**[docs/MEDIA_UPLOAD_GUIDE.md](docs/MEDIA_UPLOAD_GUIDE.md)**

Topics covered:

- Connecting Social Studio to GitHub
- Uploading photos and videos (drag-and-drop workflow)
- Dry run vs live publish
- Where every credential is stored (browser, `.env`, GitHub Secrets)
- Renewing expired tokens for GitHub, Meta, YouTube, WhatsApp, and Google Business
- Reading GitHub Actions logs when something fails

## Project structure

```
content/posts/          Post YAML files (*.yaml, archived as *.published.yaml)
media/                  Uploaded images and videos
docs/                   Social Studio dashboard (GitHub Pages)
scripts/
  publish.js            Publish pending posts
  publish-pipeline.js   Verify → approve → publish (used by Social Studio workflow)
  verify-post.js        Validate a post before approval or publishing
  approve-post.js       Move a post from review → pending
  verify-credentials.js Check platform secrets
  setup-meta-oauth.js   One-time Meta (Facebook + Instagram) OAuth setup
  setup-youtube-oauth.js One-time YouTube OAuth setup
  setup-youtube-cookies.js One-time YouTube Community image post setup
  setup-google-business-oauth.js One-time Google Business Profile OAuth setup
  setup-whatsapp.js     One-time WhatsApp Status QR setup
  lib/                  Platform clients and shared utilities
.github/workflows/
  approve-and-publish.yml  Triggered from Social Studio
  publish.yml              Daily schedule for pending posts
  deploy-pages.yml         Deploy Social Studio when docs/ changes
```

## Setup

### 1. GitHub Pages

Enable **GitHub Pages** for this repo (Settings → Pages → source: GitHub Actions). The **Deploy Social Studio** workflow runs when `docs/` changes.

### 2. Repository secrets

Add these under **Settings → Secrets and variables → Actions**:

| Secret | Platform | Required for |
|--------|----------|--------------|
| `META_PAGE_ACCESS_TOKEN` | Facebook + Instagram | Posting |
| `META_PAGE_ID` | Facebook | Posting |
| `INSTAGRAM_BUSINESS_ACCOUNT_ID` | Instagram | Posting |
| `YOUTUBE_CLIENT_ID` | YouTube | Posting |
| `YOUTUBE_CLIENT_SECRET` | YouTube | Posting |
| `YOUTUBE_REFRESH_TOKEN` | YouTube | Video uploads |
| `YOUTUBE_CHANNEL_ID` | YouTube Community | Image posts to Community tab |
| `YOUTUBE_COOKIES_JSON` | YouTube Community | Browser session cookies (JSON array) |
| `WHATSAPP_AUTH_B64` | WhatsApp Status | Posting (base64 auth archive from setup) |
| `WHATSAPP_BUSINESS_NUMBER` | WhatsApp Status | Posting (business phone, country code, no `+`, e.g. `919668913299`) |
| `WHATSAPP_STATUS_AUDIENCE` | WhatsApp Status | `all_contacts` (default) or `contacts` for a custom list |
| `WHATSAPP_STATUS_CONTACTS` | WhatsApp Status | Optional viewers when `WHATSAPP_STATUS_AUDIENCE=contacts` |
| `GOOGLE_BUSINESS_CLIENT_ID` | Google Business | Posting |
| `GOOGLE_BUSINESS_CLIENT_SECRET` | Google Business | Posting |
| `GOOGLE_BUSINESS_REFRESH_TOKEN` | Google Business | Posting |
| `GOOGLE_BUSINESS_LOCATION_NAME` | Google Business | Posting (`accounts/.../locations/...`) |
| `GOOGLE_BUSINESS_MEDIA_BASE_URL` | Google Business | Image posts (public URL prefix for `media/` files) |

For Social Studio in the browser, create a [GitHub PAT](https://github.com/settings/tokens) with **Contents: Read and write** and **Actions: Read and write**. Enter it in the dashboard — it is never stored in the repo.

### 3. Local environment

```bash
npm install
cp .env.example .env
# Fill in credentials (see OAuth setup below)
npm run verify
```

### 4. OAuth setup (one-time)

**Meta (Facebook + Instagram)**

1. Create an app at [developers.facebook.com](https://developers.facebook.com/)
2. Add Facebook Login; set redirect URI: `http://localhost:8766/oauth/callback`
3. Add `META_APP_ID` and `META_APP_SECRET` to `.env`
4. Run `npm run setup:meta` — saves Page token, Page ID, and Instagram Business Account ID

**YouTube**

1. Create OAuth credentials at [console.cloud.google.com](https://console.cloud.google.com/) (enable YouTube Data API v3)
2. Add `YOUTUBE_CLIENT_ID` and `YOUTUBE_CLIENT_SECRET` to `.env`
3. Run `npm run setup:youtube` — saves refresh token (for video uploads)

**YouTube Community (image posts)**

1. Export YouTube cookies while logged in (Cookie-Editor browser extension)
2. Run `npm run setup:youtube-cookies` — saves channel ID and cookies
3. Add `YOUTUBE_CHANNEL_ID` and `YOUTUBE_COOKIES_JSON` to GitHub Secrets

**WhatsApp Status**

1. Set `WHATSAPP_BUSINESS_NUMBER=919668913299` in `.env` (your business WhatsApp, country code, no `+`)
2. Run `npm run setup:whatsapp` — scan the QR on that business phone (+91 96689 13299)
3. Status posts to **all saved contacts** on that phone (`WHATSAPP_STATUS_AUDIENCE=all_contacts`)
4. Create `WHATSAPP_AUTH_B64` for GitHub: `tar -czf - whatsapp-auth | base64 | pbcopy`

**Google Business Profile**

1. Confirm your listing is verified and you have been owner/manager for **60+ days**
2. [Request Business Profile API access](https://support.google.com/business/contact/api_default) → choose **Application for Basic API Access**
3. In [Google Cloud Console](https://console.cloud.google.com/), enable:
   - My Business Account Management API
   - My Business Business Information API
   - Google My Business API
4. OAuth consent screen → add scope `https://www.googleapis.com/auth/business.manage`
5. Add `GOOGLE_BUSINESS_CLIENT_ID` and `GOOGLE_BUSINESS_CLIENT_SECRET` to `.env` (can reuse your YouTube OAuth client)
6. Run `npm run setup:google-business` — saves refresh token, location name, and media base URL
7. Add the printed values to GitHub Secrets

Google fetches images by URL, so `GOOGLE_BUSINESS_MEDIA_BASE_URL` must point to where your `media/` files are publicly hosted (for example `https://raw.githubusercontent.com/owner/repo/master`). In GitHub Actions, the image must already be committed and pushed before publish runs.

Copy the values printed at the end of each setup script into GitHub Secrets.

## Post format

See `content/posts/example.yaml`. Minimal fields:

```yaml
id: monday-tip-1234567890
status: pending          # draft | review | pending
publish_at: ""           # ISO 8601 datetime, or empty for immediate
platforms:
  - facebook
  - instagram
  - youtube
  - whatsapp
  - google_business
title: Post title
caption: |
  Main post text.
hashtags:
  - BishnupriyaFuels
  - BPCL
media:
  image: media/my-photo.jpg   # or video: media/my-video.mp4
```

**Platform media requirements**

| Platform | Image | Video |
|----------|-------|-------|
| Facebook | Optional | Optional |
| Instagram | Required | Required (one of image or video) |
| YouTube | Community tab (with cookies) or auto-converted to video | Supported |
| WhatsApp Status | Supported | Supported |
| Google Business | Supported (recommended 1200×900) | Not supported |

When you upload an image in Social Studio, **Instagram**, **YouTube**, **WhatsApp Status**, and **Google Business** are selected automatically.

Hashtags from the YAML are appended to the caption on publish.

## GitHub Actions workflows

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| **Approve and Publish** | Social Studio (workflow dispatch) | Verify, approve (`review` → `pending`), and publish a single post |
| **Publish Social Posts** | Daily at 9:00 AM IST + manual | Publish all due `pending` posts (skips ffmpeg/credentials when none are pending) |
| **Deploy Social Studio** | Push to `docs/` | Update the GitHub Pages dashboard |

### Approve and Publish inputs

| Input | Default | Description |
|-------|---------|-------------|
| `post_id` | — | Post `id` from the YAML file (required) |
| `dry_run` | `true` | Validate only — no posting |
| `publish` | `false` | Set `true` from Social Studio to approve and publish |

## Local CLI

```bash
# Check platform credentials
npm run verify

# Validate a post (review or pending)
npm run verify:post -- --post your-post-id
npm run verify:post -- --post your-post-id --for-publish

# Approve a review post → pending
npm run approve:post -- your-post-id

# Publish (all due pending posts, or one post)
npm run publish:dry-run -- --post your-post-id
npm run publish -- --post your-post-id

# Full pipeline: verify → approve → publish (matches Social Studio workflow)
npm run publish:pipeline -- --post your-post-id --dry-run
npm run publish:pipeline -- --post your-post-id
```

For YouTube image-to-video conversion locally, install [ffmpeg](https://ffmpeg.org/) and ensure it is on your `PATH`.

## Environment variables

| Variable | Description |
|----------|-------------|
| `META_APP_ID` / `META_APP_SECRET` | Meta app credentials (setup scripts only) |
| `META_PAGE_ACCESS_TOKEN` | Long-lived Page access token |
| `META_PAGE_ID` | Facebook Page ID |
| `INSTAGRAM_BUSINESS_ACCOUNT_ID` | Instagram Business account ID |
| `YOUTUBE_CLIENT_ID` / `YOUTUBE_CLIENT_SECRET` | Google OAuth client |
| `YOUTUBE_REFRESH_TOKEN` | YouTube upload refresh token |
| `GOOGLE_BUSINESS_CLIENT_ID` / `GOOGLE_BUSINESS_CLIENT_SECRET` | Google Business OAuth client |
| `GOOGLE_BUSINESS_REFRESH_TOKEN` | Google Business refresh token |
| `GOOGLE_BUSINESS_LOCATION_NAME` | Full location resource name |
| `GOOGLE_BUSINESS_MEDIA_BASE_URL` | Public URL prefix for post images |
| `GOOGLE_BUSINESS_LANGUAGE_CODE` | Post language (default: `en-IN`) |
| `DRY_RUN` | `true` to skip actual posting (default: `false`) |
| `CONTENT_DIR` | Post directory (default: `content/posts`) |

## Legal pages

Meta app review requires hosted privacy and data-deletion pages:

- [Privacy policy](https://privatefnsventures-maker.github.io/social-media-automation/privacy-policy.html)
- [Data deletion](https://privatefnsventures-maker.github.io/social-media-automation/data-deletion.html)

## License

MIT
