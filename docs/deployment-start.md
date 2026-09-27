# Deployment Start

The app is ready to run as one Node service:

```bash
node server.js
```

For a live private prototype, deploy the folder to a host that can run a Node web service, such as Render, Railway, Fly.io, or a small VPS.

## Required Environment Variables

Set these in the hosting provider:

```text
ADMIN_PASSWORD=choose-a-real-admin-password
SESSION_SECRET=use-a-long-random-string
WEBHOOK_SECRET=use-a-different-long-random-string
DATABASE_URL=your-neon-connection-string
HOST=0.0.0.0
PORT=provided-by-host
```

Notes:

- `ADMIN_PASSWORD` protects the web app.
- `SESSION_SECRET` signs the login cookie.
- `WEBHOOK_SECRET` protects the attendance webhook.
- `DATABASE_URL` points to the Neon Postgres database -- see [neon-setup.md](./neon-setup.md).
- `HOST=0.0.0.0` is usually required on hosted services.
- Many hosts provide `PORT` automatically, so do not hardcode it unless the host tells you to.
- `ANTHROPIC_API_KEY` (optional) powers the receipt-photo reader in Grants > Budget > Expenses --
  see [grant-management.md](./grant-management.md#receipts). Leave unset to disable AI reading;
  receipt uploads still work, just with everything filled in by hand. This is a separate
  platform.claude.com account/billing from a claude.ai login.

## Where Secrets Go

Do not put real passwords or secrets in GitHub.

Use these places instead:

- Local computer: create a private `.env` file beside `server.js`.
- Render: open the service, go to **Environment**, and add each key/value there.

The repo includes `.env.example` only as a template. Copy its keys, but use your own real values.

Example local `.env`:

```text
ADMIN_PASSWORD=your-admin-password
SESSION_SECRET=a-long-random-string
WEBHOOK_SECRET=a-different-long-random-string
DATABASE_URL=your-neon-connection-string
HOST=127.0.0.1
PORT=8765
```

The `.env` file is ignored by Git and should stay private on your computer.

## Start Command

Use this as the service start command:

```bash
node server.js
```

## Webhook URL

Once deployed, send attendance to:

```text
https://YOUR-APP-DOMAIN.com/api/attendance/webhook
```

Every webhook request must include:

```text
X-Webhook-Secret: YOUR_WEBHOOK_SECRET
```

## Current Storage Warning

The current backend stores data in local files under `data/`.

That is fine for local testing and an early staging prototype, but many free hosting platforms erase local files on redeploy. Before using this as the long-term source of truth, move storage to a database such as Postgres, SQLite on persistent disk, Supabase, Neon, or a managed host database.
