# Invite Mail Portal

A split client/server MVP for invite-only mailbox creation on your own domain.

- `client/` is the Next.js + Tailwind CSS + TypeScript frontend.
- `server/` is the TypeScript API server for invites, sessions, Mailu creation, audit logs, DNS checks, and admin tools.
- `infra/` contains Docker/Caddy deployment scaffolding.
- `ops/` contains backup and restore drill notes.

## Run Locally

Start the backend API:

```sh
cp server/.env.example server/.env
npm run dev:server
```

In another terminal, start the frontend:

```sh
cp client/.env.example client/.env.local
npm run dev:client
```

Open `http://localhost:3000`. The client proxies `/api/*` to the server at `http://localhost:4000` by default.

Local mode defaults to `MAILU_DRY_RUN=true`, so mailboxes are recorded in `server/data/db.json` without calling Mailu.

## Production Shape

1. Deploy Mailu from its official generator.
2. Configure DNS, PTR, SPF, DKIM, DMARC, and TLS.
3. Set `server/.env` with real domain/Mailu values and `MAILU_DRY_RUN=false`.
4. Set `client/.env.local` with `SERVER_URL` for the API location.
5. Run `docker compose -f infra/docker-compose.yml up -d --build`.
6. Use `/admin` to create invite codes.

Read `docs/DEPLOYMENT.md` before pointing real users at it.
