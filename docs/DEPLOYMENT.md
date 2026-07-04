# Deployment Guide

This repository is now split into two apps:

- `client/`: Next.js + Tailwind CSS + TypeScript frontend.
- `server/`: TypeScript backend API that stores invites/accounts and calls Mailu.

Mail transport, IMAP, SMTP, spam filtering, DKIM, and webmail should still be handled by Mailu.

## 1. VPS preflight

Use Ubuntu LTS with a static public IP. Before launch, confirm:

- Port `25` inbound and outbound is open.
- Reverse DNS/PTR for the VPS IP points to `mail.yourdomain.com`.
- `mail.yourdomain.com` has `A` and, if used, `AAAA` records.
- Your domain has an `MX` record pointing to `mail.yourdomain.com`.
- SPF, DKIM, and DMARC records are published.
- TLS works for the portal and Mailu hostnames.

Run:

```sh
cd server
MAIL_DOMAIN=yourdomain.com MAIL_HOSTNAME=mail.yourdomain.com npm run dns:preflight
```

## 2. Install Mailu

Generate Mailu's official Docker Compose files with the Mailu setup utility.
Use values matching `infra/mailu.env.example`.

Keep Mailu registration closed. The portal owns invite creation and mailbox creation through the Mailu API.

## 3. Configure server

Copy `server/.env.example` to `server/.env` and set:

```sh
PORT=4000
CLIENT_ORIGIN=https://portal.yourdomain.com
MAIL_DOMAIN=yourdomain.com
MAIL_HOSTNAME=mail.yourdomain.com
WEBMAIL_URL=https://mail.yourdomain.com/webmail/
MAILU_API_BASE=https://mail.yourdomain.com
MAILU_API_TOKEN=the-same-token-from-mailu
MAILU_DRY_RUN=false
DATABASE_URL=file:./data/db.json
ADMIN_TOKEN=a-long-random-admin-token
APP_SECRET=a-long-random-app-secret
```

For local testing, leave `MAILU_DRY_RUN=true`.

## 4. Configure client

Copy `client/.env.example` to `client/.env.local` and set:

```sh
SERVER_URL=http://localhost:4000
NEXT_PUBLIC_MAIL_DOMAIN=yourdomain.com
```

In Docker, `SERVER_URL` is set to `http://server:4000`.

## 5. Start services

```sh
docker compose -f infra/docker-compose.yml up -d --build
```

Update `infra/Caddyfile` before production so it uses your real portal hostname.

## 6. Create invites

From the frontend admin UI at `/admin`, enter `ADMIN_TOKEN` and generate invite codes.
For local CLI seeding:

```sh
npm run seed:admin -- "first tester"
```

## 7. Reliability checklist

- Schedule `ops/backup-mail-stack.sh` daily with encrypted output.
- Keep at least one off-server backup copy.
- Configure disk usage alerts before storage reaches 80%.
- Watch the Mailu/Postfix queue and Rspamd logs.
- Start with low outbound limits and raise them only after reputation stabilizes.
