# Deploying ARJUN

> **✅ LIVE — deployed 2026-10-10 (Option A: Railway + Supabase)**
>
> - **App**: https://arjun-production-04c9.up.railway.app — Railway project
>   **"arjun"** (`2d1c6f3a-50d1-47a9-a53f-bcbb6081481b`), region
>   **asia-southeast1 (Singapore)**, 1 replica, healthcheck `/api/healthz`,
>   Dockerfile builder.
> - **Database**: Supabase **"arjun vault"** (`xgfiavvjzvnumrvqkldh`,
>   ap-southeast-2) — schema + seed applied, `?pgbouncer=true` pooled URL.
> - **Redis**: Railway Redis service, wired via `REDIS_URL=${{Redis.REDIS_URL}}`.
> - **Env**: `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET`, `ENCRYPTION_KEY`,
>   `NODE_ENV=production`, `APP_URL=https://arjun-production-04c9.up.railway.app`,
>   `REDIS_URL` — all set on the Railway `production` environment.
> - Verified live: healthz (db+redis ok), landing 200, admin login 200,
>   Supabase-backed journal stats, public stats.
>
> Deploy fixes applied along the way (all verified):
> 1. **Next.js 14.2.25 → 14.2.35** + `nanoid@5.1.16`, `nodemailer@10.0.16`,
>    `postcss@8.5.29` (npm override) — Railway's build gate blocks HIGH+ CVEs.
> 2. **Dockerfile**: copy `prisma/` in the deps stage (postinstall
>    `prisma generate` needs the schema).
> 3. **`?pgbouncer=true&connection_limit=10`** on the pooled DATABASE_URL
>    (pgBouncer prepared-statement collision + pool size for parallel queries;
>    `connection_limit=1` caused `P2024` timeouts on the dashboard → HTTP 500).

ARJUN is a **single custom Node server**: Next.js + Socket.IO realtime +
an in-process background job runner (`server.ts`). This has a direct
consequence for hosting:

> **Vercel's serverless platform cannot run WebSockets or long-lived custom
> servers.** Socket.IO (messenger realtime, presence, live notifications) and
> the background job runner (MT5 sync, alerts, meeting reminders) require a
> persistent Node process.

Two production architectures are supported:

---

## Option A — Full platform on a Node host (recommended, works today)

Deploy the **whole app** (custom server included) to any Node-capable host,
with **Supabase** as the PostgreSQL database.

Everything is packaged — pick your platform:

| Host | Config file | Deploy steps |
|---|---|---|
| **Railway** | `railway.json` | Push the repo → Railway builds via Nixpacks (`npm ci && npm run build`), starts `npm start`, health check `/api/healthz`. Add a Redis service. Set env vars below. |
| **Render** | `render.yaml` | Connect the repo → Render reads the blueprint (region `sin`, health check `/api/healthz`). Fill the `sync: false` secrets in the dashboard. Add a Redis instance. |
| **Fly.io** | `fly.toml` + `Dockerfile` | `fly launch` (or `fly deploy` with this repo) → region `bom` (Mumbai), 1 GB machine, machine never idle-stops (required for Socket.IO). Set secrets with `fly secrets set …`. |
| **Any Docker host / VPS** | `Dockerfile` + `.dockerignore` | `docker build -t arjun . && docker run -p 3000:3000 --env-file .env.production arjun` behind nginx/Caddy with TLS. |

### Step 0 — Supabase database (once) ✅ DONE 2026-10-10

Project **"arjun vault"** (`xgfiavvjzvnumrvqkldh`, region `ap-southeast-2`):

- ✅ Schema applied — 43 objects (42 tables + `_prisma_migrations`),
  Prisma bookkeeping recorded with the exact migration checksum.
- ✅ Seeded — 21 instruments + `admin@arjun.local` (ADMIN).
- ✅ Verified end-to-end — Prisma reads/writes through the pooled
  connection (`?pgbouncer=true&connection_limit=1` — **required**, see
  `docs/SUPABASE.md`).
- Production values live in **`.env.production`** (gitignored).

For a *fresh* project, the same result comes from:

```bash
DATABASE_URL="postgresql://postgres.[ref]:[pw]@aws-0-[region].pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1" \
DIRECT_URL="postgresql://postgres.[ref]:[pw]@aws-0-[region].supabase.com:5432/postgres" \
  ./scripts/deploy.sh supabase-db     # prisma migrate deploy + seed
```

Verified: the migration chain exactly reproduces the schema on a fresh
database (`./scripts/deploy.sh verify` → "No difference detected").

### Step 1 — environment variables on the host

| Var | Value |
|---|---|
| `DATABASE_URL` | Supabase **pooled** connection (pgBouncer, port 6543) |
| `DIRECT_URL` | Supabase **direct** connection (port 5432) — only needed for migrations |
| `AUTH_SECRET` | `openssl rand -hex 32` |
| `ENCRYPTION_KEY` | `openssl rand -hex 32` |
| `REDIS_URL` | platform Redis / Upstash (app falls back to in-memory if unset — fine for 1 instance) |
| `APP_URL` | the platform's public URL, e.g. `https://arjun.fly.dev` (no trailing slash) |
| `PORT` | set automatically by Railway/Render/Fly (the server reads it) |
| `GOOGLE_CLIENT_ID/SECRET`, `SMTP_*`, `LIVEKIT_*`, `MT5_BRIDGE_URL`, `TWELVE_DATA_API_KEY` | optional — unconfigured features show setup-required states |

### Step 2 — build & start

```bash
npm run build && npm start     # or: ./scripts/deploy.sh full-server
# tsx server.ts → Next + Socket.IO + job runner on 0.0.0.0:$PORT
```

Everything works: auth, realtime messenger, presence, notifications, background
jobs, meetings (LiveKit), MT5 sync.

### Scaling note (honest)

Socket.IO presence and the in-memory job runner are **per-instance**. Run
**one instance** (all configs above pin `min_machines_running = 1` / starter
plan). To scale horizontally later: add the Redis adapter to Socket.IO and
move the job runner to a dedicated worker — the interfaces are already in
place (`src/server/realtime.ts`, `src/server/jobs.ts`).

---

## Option B — Vercel for the web tier (realtime refactor: DONE)

If you specifically need **Vercel** for the Next.js frontend + API routes:

1. **Database**: Supabase Postgres (see `docs/SUPABASE.md`) — works unchanged.
2. **Vercel project**: `vercel.json` is included; set all env vars in the
   Vercel dashboard (never commit `.env`). Build command `npm run build`.
3. **Realtime** — already handled. The transport is pluggable
   (`src/lib/realtime/server.ts`, `src/lib/client/realtime.ts`) and picks a
   provider automatically:
   - `socketio` — in-process Socket.IO (Node host)
   - `supabase` — Supabase Realtime broadcast (works on Vercel)
   - `none`     — no push; clients refetch instead

   Set `REALTIME_PROVIDER=supabase` **and**
   `NEXT_PUBLIC_REALTIME_PROVIDER=supabase` on Vercel, plus:
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`. (Left on `auto` it also works — the browser
   probes `/api/socket`, gets an HTML 404 on Vercel, and falls back to
   Supabase on its own. Setting it explicitly just skips the probe.)
4. **Background jobs** — use `/api/jobs/run`, scheduled by the `crons` entry in
   `vercel.json`. It is protected by `CRON_SECRET`, which Vercel Cron sends as
   `Authorization: Bearer <secret>`. Without a secret the route returns 503
   rather than exposing a public trigger.
   **Hobby plans cap cron jobs at once per day** — `vercel.json` ships a daily
   schedule so it always deploys. For timely meeting reminders (15 minutes
   before) and price alerts, upgrade to Pro and change the schedule to
   `*/5 * * * *`.
5. **Uploads**: set `STORAGE_PROVIDER=s3` (Supabase Storage or any S3-compatible
   bucket). Local disk does not persist on Vercel.

The same codebase therefore deploys to both: a Node host keeps the custom
server and Socket.IO, Vercel uses Supabase Realtime plus a cron-driven job
runner, and neither loses authorization logic — that stays server-side in the
REST routes either way.

---

## Secrets checklist (production)

- [ ] `AUTH_SECRET`, `ENCRYPTION_KEY` — fresh random values (`openssl rand -hex 32`)
- [ ] `DATABASE_URL` / `DIRECT_URL` — Supabase or managed Postgres
- [ ] `REDIS_URL` — Upstash/Redis Cloud (falls back to in-memory if absent)
- [ ] `GOOGLE_CLIENT_ID/SECRET` — Google Cloud console, authorized redirect:
      `${APP_URL}/api/auth/google/callback`
- [ ] `LIVEKIT_*` — LiveKit Cloud or self-hosted `livekit-server`
- [ ] `MT5_BRIDGE_URL` — your MT5 gateway (else MT5 shows setup-required)
- [ ] `SMTP_*` — transactional email (else emails are logged server-side)
- [ ] `STORAGE_PROVIDER=s3` + `S3_*` on Vercel/serverless hosts
- [ ] `APP_URL` — public https URL (no trailing slash)

## Post-deploy smoke test

```bash
curl -s https://your-host/api/stats/public
# register → login → create a trade → check /api/journal/stats → send a message
```

---

## Quick path — one-command deployment

Everything is staged in `scripts/deploy.sh`:

```bash
# 0. Verify the database layer is deploy-ready (no credentials needed)
./scripts/deploy.sh verify

# 1. Supabase — point the app at your project (needs your connection strings)
DATABASE_URL="postgresql://postgres.[ref]:[pw]@aws-0-[region].pooler.supabase.com:6543/postgres" \
DIRECT_URL="postgresql://postgres.[ref]:[pw]@aws-0-[region].supabase.com:5432/postgres" \
  ./scripts/deploy.sh supabase-db

# 2a. Option A — full server on Railway/Render/Fly (recommended)
#     set env vars on the host (DATABASE_URL, AUTH_SECRET, ENCRYPTION_KEY,
#     REDIS_URL, APP_URL, …) and deploy with: npm run build && npm start

# 2b. Option B — Vercel web tier (needs VERCEL_TOKEN + the realtime refactor)
VERCEL_TOKEN="…" ./scripts/deploy.sh vercel
```

## What to send me to complete a hosted deployment

| Needed for | Value | Where to get it |
|---|---|---|
| Supabase database | `DATABASE_URL` (pooled :6543) + `DIRECT_URL` (direct :5432) | Supabase dashboard → Settings → Database → Connection string |
| …or CLI access | `SUPABASE_ACCESS_TOKEN` + project ref | supabase.com → Account → Access Tokens |
| Vercel deploy | `VERCEL_TOKEN` (+ org/project IDs if in a team) | vercel.com → Account → Tokens |
| Full-server host (Option A) | Railway/Render/Fly account, or a VPS with Node 20 | your choice |

With those, I run the scripts above and hand you a live URL. Without them,
no deploy can happen — and I won't pretend otherwise.

## Verifying a Supabase connection

```bash
./scripts/deploy.sh verify          # schema + migrations + drift check (local)
# then against Supabase:
DATABASE_URL=… DIRECT_URL=… npx prisma migrate status
DATABASE_URL=… npx prisma db pull   # introspect what's actually deployed
```
