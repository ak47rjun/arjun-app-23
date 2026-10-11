# Using Supabase with ARJUN

ARJUN uses **PostgreSQL + Prisma**. Supabase is a fully compatible PostgreSQL host —
you only need to point the connection strings at your Supabase project.

> **✅ LIVE — connected 2026-10-10.** Project **"arjun vault"**
> (`xgfiavvjzvnumrvqkldh`, region `ap-southeast-2`, Postgres 17.11).
> Schema migrated (43 objects incl. `_prisma_migrations`), seeded
> (21 instruments + admin). Production values are in **`.env.production`**
> (gitignored) — copy them into your hosting platform's env vars.

## 1. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) → New project.
2. Note the project ref (e.g. `abcdefghijklmnopqrst`) and the database password.

## 2. Get the connection strings

In the Supabase dashboard → **Settings → Database → Connection string**:

- **Pooled (pgBouncer, transaction mode)** — port **6543** → use for `DATABASE_URL`
  (this is what the running app uses at runtime)
- **Direct connection** — port **5432** → use for `DIRECT_URL`
  (Prisma migrations need this; pgBouncer transaction mode cannot run all DDL)

Example:

```bash
# .env (production)
DATABASE_URL="postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres"
DIRECT_URL="postgresql://postgres.[ref]:[password]@aws-0-[region].supabase.com:5432/postgres"
```

Add `?sslmode=require` if your network requires it.

### ⚠️ Required for Prisma: `?pgbouncer=true`

Append **`pgbouncer=true`** to the **pooled** URL. Supabase's transaction
pooler reuses backend connections, which collides with Prisma's named
prepared statements (`ERROR: prepared statement "s0" already exists`).
The parameter tells Prisma to disable prepared statements:

```bash
DATABASE_URL="postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres?pgbouncer=true"
```

Verified against the live project: reads + writes work through the pooler
with this flag; without it, queries fail with `42P05`.

### Pool size (`connection_limit`)

- **Serverless (Vercel et al.)**: `connection_limit=1` — one connection per
  function instance is all pgBouncer needs.
- **ARJUN's persistent custom server (Railway/Render/Fly)**: use
  **`connection_limit=10`**. The app fires many queries in parallel
  (dashboard, terminal, journal); with `1`, queries queue and fail with
  `P2024 — Timed out fetching a new connection from the connection pool`.

```bash
DATABASE_URL="postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=10"
```

## 3. Run migrations

```bash
npm run db:deploy     # prisma migrate deploy (uses DIRECT_URL)
npm run db:seed       # seeds instruments + admin (safe to re-run)
```

## 4. Row Level Security (optional hardening)

ARJUN enforces authorization in the API layer (server-side ownership checks on
every private resource). If you additionally enable Supabase RLS, the app's
service-role connection bypasses RLS by design (it is the trusted backend).
Do **not** expose the service-role key to browsers — only `DATABASE_URL` lives
server-side (Vercel env vars / your host's env), never in client code.

## 5. Supabase Realtime (future option)

The app's realtime layer is Socket.IO on a custom Node server. If you deploy the
frontend to Vercel (which cannot host Socket.IO), you can replace the realtime
transport with Supabase Realtime channels (or Pusher/Ably) behind the same
`src/server/realtime.ts` interface — see `docs/DEPLOYMENT.md`.

## 6. Storage (optional)

ARJUN stores uploads via its storage abstraction. Default is local disk
(`STORAGE_PROVIDER=local`). For Supabase Storage or any S3-compatible provider,
set `STORAGE_PROVIDER=s3` plus `S3_*` variables (Supabase Storage is
S3-compatible: endpoint `https://[ref].supabase.co/storage/v1/s3`).
