# Credential recovery — all tokens in this project

Quick reference when **any** token or session expires in social-media-automation.

---

## First step: find what failed

```bash
npm run verify
```

Shows **OK**, **FAIL**, or **MISSING** for each platform. If something failed, you get copy-paste fix steps automatically.

### Automatic renewal (interactive)

```bash
npm run verify:fix
```

For each failed platform, offers to run the matching setup script (OAuth login, QR scan, etc.). After each fix, copy new values to GitHub Secrets.

---

## All tokens in this project

| What | Used for | Stored in | Renew with | GitHub Secrets to update |
|------|----------|-----------|------------|--------------------------|
| **GitHub PAT** | Social Studio upload to repo | Browser only | [New PAT](https://github.com/settings/tokens) | — (not in Secrets) |
| **Meta Page token** | Facebook + Instagram posting | `.env` + Secrets | `npm run setup:meta` | `META_PAGE_ACCESS_TOKEN`, `META_PAGE_ID`, `INSTAGRAM_BUSINESS_ACCOUNT_ID` |
| **YouTube OAuth** | YouTube video upload | `.env` + Secrets | `npm run setup:youtube` | `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, `YOUTUBE_REFRESH_TOKEN` |
| **YouTube cookies** | YouTube Community image posts | `.env` + Secrets | `npm run setup:youtube-cookies` | `YOUTUBE_CHANNEL_ID`, `YOUTUBE_COOKIES_JSON` |
| **WhatsApp session** | WhatsApp Status posts | `whatsapp-auth/` + Secrets | `npm run setup:whatsapp` | `WHATSAPP_AUTH_B64` |
| **Google Business OAuth** | GBP posts + social links | `.env` + Secrets | `npm run setup:google-business` | All five `GOOGLE_BUSINESS_*` below |
| **Google Business social URLs** | Link profiles on GBP | `.env` only (optional overrides) | `npm run setup:google-business-social` | Same `GOOGLE_BUSINESS_*` secrets |

### Google Business secrets (all five)

| Secret |
|--------|
| `GOOGLE_BUSINESS_CLIENT_ID` |
| `GOOGLE_BUSINESS_CLIENT_SECRET` |
| `GOOGLE_BUSINESS_REFRESH_TOKEN` |
| `GOOGLE_BUSINESS_LOCATION_NAME` |
| `GOOGLE_BUSINESS_MEDIA_BASE_URL` |

---

## Common error messages → what to run

| Error / symptom | Platform | Fix |
|-----------------|----------|-----|
| `invalid_grant` | YouTube or Google Business | `npm run setup:youtube` or `npm run setup:google-business` |
| `Error validating access token` / code `190` | Meta | `npm run setup:meta` |
| `Facebook Page token invalid` | Meta | `npm run setup:meta` |
| `WhatsApp auth not configured` | WhatsApp | `npm run setup:whatsapp` → `npm run export:whatsapp-auth` |
| `WHATSAPP_AUTH_B64 is set but invalid` | WhatsApp | `npm run export:whatsapp-auth` → update Secret |
| `401 Bad credentials` (GitHub) | Social Studio PAT | New PAT in Social Studio browser settings |
| `Google My Business API ... disabled` | Google Cloud | Enable APIs in Console (see [MEDIA_UPLOAD_GUIDE](MEDIA_UPLOAD_GUIDE.md)) |
| Verify OK locally, FAIL in Actions | GitHub Secrets stale | Copy `.env` values to [GitHub Secrets](https://github.com/fnsventures/social-media-automation/settings/secrets/actions) |

---

## Standard renewal workflow

```
1. npm run verify              → see which platform failed
2. npm run verify:fix          → run setup scripts (optional)
3. Copy .env → GitHub Secrets  → Actions does NOT read local .env
4. npm run verify              → confirm all OK
5. Re-run failed GitHub Action or publish again in Social Studio
```

---

## Per-platform commands

### Meta (Facebook + Instagram)

```bash
npm run setup:meta
```

Updates: `META_PAGE_ACCESS_TOKEN`, `META_PAGE_ID`, `INSTAGRAM_BUSINESS_ACCOUNT_ID`

### YouTube

```bash
npm run setup:youtube
```

Updates: `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, `YOUTUBE_REFRESH_TOKEN`

For Community tab image posts:

```bash
npm run setup:youtube-cookies
```

Updates: `YOUTUBE_CHANNEL_ID`, `YOUTUBE_COOKIES_JSON`

### WhatsApp Status

```bash
npm run setup:whatsapp
npm run export:whatsapp-auth
```

Copy `WHATSAPP_AUTH_B64` to GitHub Secrets. Scan QR on business phone **+91 96689 13299**.

### Google Business (posting + API access)

```bash
npm run setup:google-business
```

Sign in as the Google account that manages **Bishnu Priya Fuels**.

### Google Business social profile links

```bash
npm run setup:google-business-social
npm run check:google-business-social    # verify only
```

Uses same `GOOGLE_BUSINESS_*` token. If Meta token expired but you only need URLs, set `GOOGLE_BUSINESS_FACEBOOK_URL` and `GOOGLE_BUSINESS_INSTAGRAM_URL` in `.env` manually.

See **[GOOGLE_BUSINESS_SOCIAL_LINKS.md](GOOGLE_BUSINESS_SOCIAL_LINKS.md)**.

### Social Studio GitHub token

1. [github.com/settings/tokens](https://github.com/settings/tokens) → new classic token  
2. Scopes: **repo** + **workflow**  
3. [Social Studio](https://fnsventures.github.io/social-media-automation/) → GitHub connection → paste → Save  

Not stored in GitHub Secrets.

---

## GitHub Secrets URL

[fnsventures/social-media-automation → Settings → Secrets → Actions](https://github.com/fnsventures/social-media-automation/settings/secrets/actions)

---

## More detail

- **[MEDIA_UPLOAD_GUIDE.md](MEDIA_UPLOAD_GUIDE.md)** — step-by-step with screenshots-style instructions per platform  
- **[README.md](../README.md)** — project setup overview
