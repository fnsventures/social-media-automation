# Social Media Automation

Cross-post content to **Facebook**, **Instagram**, and **YouTube** from a web dashboard or the command line.

Built for [Bishnupriya Fuels](https://bishnupriyafuels.fnsventures.in/) (BPCL outlet, Jajpur).

## Features

- **Social Studio** — browser dashboard on GitHub Pages to upload media, write captions, and publish
- **Multi-platform publishing** — one post YAML drives Facebook, Instagram, and YouTube
- **Review workflow** — posts go through `review` → `pending` → `published` before going live
- **Dry run** — validate credentials and media without posting
- **Scheduled publishing** — GitHub Actions runs daily for due `pending` posts
- **Image-to-video** — when only an image is provided, YouTube gets an auto-generated short clip (requires ffmpeg)

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
                         Facebook                      Instagram                        YouTube
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
| `YOUTUBE_REFRESH_TOKEN` | YouTube | Posting |

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
3. Run `npm run setup:youtube` — saves refresh token

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
| YouTube | Auto-converted to video | Supported |

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
| `DRY_RUN` | `true` to skip actual posting (default: `false`) |
| `CONTENT_DIR` | Post directory (default: `content/posts`) |

## Legal pages

Meta app review requires hosted privacy and data-deletion pages:

- [Privacy policy](https://privatefnsventures-maker.github.io/social-media-automation/privacy-policy.html)
- [Data deletion](https://privatefnsventures-maker.github.io/social-media-automation/data-deletion.html)

## License

MIT
