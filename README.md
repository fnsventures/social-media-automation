# Social Media Automation

Cross-post content to **Facebook**, **Instagram**, and **YouTube** from one web dashboard.

Built for [Bishnupriya Fuels](https://bishnupriyafuels.fnsventures.in/) (BPCL outlet, Jajpur).

## How it works

1. Open **Social Studio** (GitHub Pages dashboard).
2. **Upload** your photo/video and write the caption.
3. **Review** the post, then **Save to GitHub**.
4. **Publish** to Facebook, Instagram, and YouTube (dry run first).

Dashboard URL: `https://<owner>.github.io/social-media-automation/`

## GitHub Secrets

| Secret | Platform |
|--------|----------|
| `META_PAGE_ACCESS_TOKEN` | Facebook + Instagram |
| `META_PAGE_ID` | Facebook |
| `INSTAGRAM_BUSINESS_ACCOUNT_ID` | Instagram |
| `YOUTUBE_CLIENT_ID` | YouTube |
| `YOUTUBE_CLIENT_SECRET` | YouTube |
| `YOUTUBE_REFRESH_TOKEN` | YouTube |

For the dashboard, use a GitHub PAT with **Contents** and **Actions** read/write (browser only, not stored in the repo).

## Workflows

| Workflow | Purpose |
|----------|---------|
| **Approve and Publish** | Triggered from Social Studio — verify, approve, publish |
| **Publish Social Posts** | Daily schedule for `status: pending` posts |
| **Deploy Social Studio** | Updates the web dashboard when `docs/` changes |

## Local CLI

```bash
npm install
cp .env.example .env
npm run verify
npm run verify:post -- --post your-post-id
npm run approve:post -- your-post-id
npm run publish:dry-run -- --post your-post-id
npm run publish -- --post your-post-id
```

## License

MIT
