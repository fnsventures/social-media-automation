# Google Business Profile — social profile links

This guide explains how to link your **Bishnupriya Fuels** Facebook, Instagram, and other social profiles on Google Business Profile (GBP) — including when the dashboard **Social profiles** field is missing in India.

It also covers the **Social media updates** carousel (posts pulled from linked accounts) and how to fix expired tokens.

---

## What this feature does

| Feature | What it is |
|---------|------------|
| **Social profile links** | Icons/links on your GBP listing (Facebook, Instagram, YouTube, etc.) |
| **Social media updates carousel** | Recent posts from linked Facebook/Instagram shown on Search/Maps |
| **Local posts (API)** | Posts you publish via Social Studio → separate “Updates” / “From the owner” section |

The command `npm run setup:google-business-social` sets **social profile links** via the [Google Business Profile API](https://developers.google.com/my-business/reference/businessinformation/rest/v1/locations/updateAttributes). This works even when you cannot see **Edit profile → Contact → Social profiles** in the web UI.

---

## Quick start (5 minutes)

### 1. Prerequisites

You need Google Business API access first:

```bash
npm run setup:google-business
```

That saves `GOOGLE_BUSINESS_REFRESH_TOKEN` and `GOOGLE_BUSINESS_LOCATION_NAME` to `.env`.

### 2. Link social profiles

```bash
npm run setup:google-business-social
```

The script will:

1. Check your Google Business credentials
2. Detect Facebook/Instagram URLs from Meta credentials (if set)
3. Show you a preview of links to apply
4. Ask for confirmation (unless you pass `--yes`)
5. Save links on your GBP listing

### 3. Verify

```bash
npm run check:google-business-social
# or
npm run setup:google-business-social -- --check
```

Also included in:

```bash
npm run verify
```

---

## Recommended link strategy (Bishnupriya Fuels)

Google allows **one link per platform**. For an authorised BPCL retail outlet:

| Platform | Recommended link | Why |
|----------|------------------|-----|
| **Facebook** | Your outlet (`facebook.com/bishnupriyafuels`) | Feeds **your** posts into the social carousel |
| **Instagram** | Your outlet (`instagram.com/bishnupriyafuels`) | Same — carousel already works here |
| **YouTube** | BPCL official (`youtube.com/user/bpclbrand`) | Corporate channel (optional) |
| **LinkedIn** | Omit unless you have an outlet page | BPCL corporate LinkedIn is not shown on local listings |
| **X (Twitter)** | Omit unless you have an outlet page | BPCL corporate X is not shown on local listings |
| **WhatsApp** | Your number (`wa.me/919668913299`) | Customer chat |

Enable BPCL YouTube in `.env`:

```bash
GOOGLE_BUSINESS_INCLUDE_BPCL_OFFICIAL=true
```

BPCL Facebook/Instagram cannot be added **in addition** to your outlet on the same platform — only one per slot. Keep outlet pages on Facebook/Instagram for the carousel.

---

## Commands reference

| Command | What it does |
|---------|--------------|
| `npm run verify` | Check **all** platform credentials; print fix steps if any fail |
| `npm run verify:fix` | Same as verify, plus offer to run renewal scripts automatically |
| `npm run setup:google-business-social` | Interactive setup — link profiles |
| `npm run check:google-business-social` | Check credentials + current links only |
| `npm run setup:google-business-social -- --fix` | If token expired, offers to run renewal script |
| `npm run setup:google-business-social -- --yes` | Apply without confirmation |
| `npm run setup:google-business` | Renew Google OAuth token |
| `npm run setup:meta` | Renew Facebook/Instagram token |
| `npm run verify` | Check all platform credentials + social links |

---

## Environment variables

Add these to `.env` (see `.env.example`):

```bash
# Required (from npm run setup:google-business)
GOOGLE_BUSINESS_CLIENT_ID=
GOOGLE_BUSINESS_CLIENT_SECRET=
GOOGLE_BUSINESS_REFRESH_TOKEN=
GOOGLE_BUSINESS_LOCATION_NAME=

# Outlet pages (optional — auto-detected from Meta if not set)
GOOGLE_BUSINESS_FACEBOOK_URL=https://www.facebook.com/bishnupriyafuels
GOOGLE_BUSINESS_INSTAGRAM_URL=https://www.instagram.com/bishnupriyafuels

# BPCL corporate on YouTube (one link per platform on GBP):
GOOGLE_BUSINESS_INCLUDE_BPCL_OFFICIAL=true
GOOGLE_BUSINESS_YOUTUBE_URL=https://www.youtube.com/user/bpclbrand
```

**GitHub Secrets:** Social linking uses the same `GOOGLE_BUSINESS_*` secrets as posting. You do **not** need extra secrets for social links — only renew `GOOGLE_BUSINESS_REFRESH_TOKEN` when it expires.

---

## Token expiry — all platforms

When **any** credential expires, start here:

```bash
npm run verify        # which platform failed?
npm run verify:fix    # optional auto-renewal scripts
```

| Platform | Renew with |
|----------|------------|
| Facebook + Instagram | `npm run setup:meta` |
| YouTube | `npm run setup:youtube` |
| YouTube Community | `npm run setup:youtube-cookies` |
| WhatsApp Status | `npm run setup:whatsapp` → `npm run export:whatsapp-auth` |
| Google Business | `npm run setup:google-business` |
| Google Business social links | `npm run setup:google-business-social -- --fix` |

Full table: **[docs/CREDENTIAL_RECOVERY.md](docs/CREDENTIAL_RECOVERY.md)**

---

## When tokens expire — what to do

### Google Business token expired

**Symptoms**

- `invalid_grant` or `token has been expired`
- `npm run setup:google-business-social` fails at “Connected to…”
- `npm run verify` shows Google Business **FAIL**

**Fix (automatic with `--fix`)**

```bash
npm run setup:google-business-social -- --fix
```

When prompted, choose **Yes** to run `npm run setup:google-business`. Sign in with the Google account that manages **Bishnu Priya Fuels**.

**Fix (manual)**

```bash
npm run setup:google-business
```

Then copy these from `.env` to [GitHub Secrets](https://github.com/fnsventures/social-media-automation/settings/secrets/actions):

| Secret name |
|-------------|
| `GOOGLE_BUSINESS_CLIENT_ID` |
| `GOOGLE_BUSINESS_CLIENT_SECRET` |
| `GOOGLE_BUSINESS_REFRESH_TOKEN` |
| `GOOGLE_BUSINESS_LOCATION_NAME` |
| `GOOGLE_BUSINESS_MEDIA_BASE_URL` |

Verify:

```bash
npm run verify
```

---

### Meta (Facebook/Instagram) token expired

**Symptoms**

- `Error validating access token` or OAuth error code `190`
- Script cannot auto-detect Facebook/Instagram URLs

**Fix option A — renew Meta token (recommended)**

```bash
npm run setup:google-business-social -- --fix
```

Choose option **1** to run `npm run setup:meta`, then re-run the social setup.

Or manually:

```bash
npm run setup:meta
npm run setup:google-business-social
```

Update GitHub Secrets:

| Secret name |
|-------------|
| `META_PAGE_ACCESS_TOKEN` |
| `META_PAGE_ID` |
| `INSTAGRAM_BUSINESS_ACCOUNT_ID` |

**Fix option B — paste URLs manually (no Meta token needed)**

Add to `.env`:

```bash
GOOGLE_BUSINESS_FACEBOOK_URL=https://www.facebook.com/bishnupriyafuels
GOOGLE_BUSINESS_INSTAGRAM_URL=https://www.instagram.com/bishnupriyafuels
```

Then:

```bash
npm run setup:google-business-social
```

---

## Social media updates carousel — troubleshooting

### Instagram shows but Facebook does not

Common causes:

1. **Facebook Page has no username** — set one in Facebook Page settings (`facebook.com/bishnupriyafuels` not numeric ID)
2. **Facebook posts are less crawlable** than Instagram — wait 24–72 hours after linking
3. **Keep posting** to both platforms via Social Studio

Re-apply links after setting username:

```bash
npm run setup:google-business-social
```

### Local posts (from Social Studio) not visible

Your API posts may be **LIVE** but hard to find on mobile:

1. Open **Google Maps** → your business → **Updates** tab
2. Scroll **below reviews** on mobile Search
3. Direct link: `https://local.google.com/place?id=3335355729942462486&use=posts`

### Pending Social Studio posts

Posts with `status: review` in `content/posts/` are **not published**. Approve and publish via [Social Studio](https://fnsventures.github.io/social-media-automation/) or the CLI pipeline.

---

## Step-by-step: first-time setup

1. **Google Business API** (one-time)  
   - [Request API access](https://support.google.com/business/contact/api_default)  
   - Enable APIs in Google Cloud  
   - `npm run setup:google-business`

2. **Meta** (for auto-detect + posting)  
   - `npm run setup:meta`

3. **Link social profiles**  
   - Set `GOOGLE_BUSINESS_INCLUDE_BPCL_OFFICIAL=true` in `.env`  
   - `npm run setup:google-business-social`

4. **Confirm**  
   - `npm run check:google-business-social`  
   - Wait 24–72 hours, check Maps → Updates

5. **Ongoing**  
   - Post 2× per week via Social Studio  
   - Run `npm run verify` if anything fails

---

## Official BPCL social links (reference)

From [bharatpetroleum.in](https://www.bharatpetroleum.in/contact-us):

| Platform | URL |
|----------|-----|
| Facebook | https://www.facebook.com/BharatPetroleumCorporation |
| Instagram | https://www.instagram.com/bpclimited |
| LinkedIn | https://www.linkedin.com/company/bpcl |
| YouTube | https://www.youtube.com/user/bpclbrand |
| X | https://twitter.com/bpclimited |

---

## Related docs

- [MEDIA_UPLOAD_GUIDE.md](MEDIA_UPLOAD_GUIDE.md) — posting, credentials, GitHub Secrets
- [README.md](../README.md) — project overview
- [Google: Manage social media links](https://support.google.com/business/answer/13580646)
- [Google: Create & manage posts](https://support.google.com/business/answer/7662907)
