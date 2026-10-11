# Vercel deploy — fill-in checklist

Everything except the secrets is already done in the code. Fill these in and
paste them into **Vercel → Project → Settings → Environment Variables**.

> Never commit `.env`. `.env` is gitignored.

---

## 1. Database — REQUIRED ✅ needs you

**Yes, this app needs PostgreSQL.** 34 tables, Prisma, migrations. There is no
"no-database" mode.

Free option: **Supabase** → https://supabase.com/dashboard → *New project*
(free tier). Then *Project Settings → Database → Connection string*:

```env
# Pooled (port 6543) — used by the app at runtime
DATABASE_URL=postgresql://postgres.<ref>:<PASSWORD>@aws-0-<region>.pooler.supabase.com:6543/postgres
# Direct (port 5432) — used by prisma migrate
DIRECT_URL=postgresql://postgres.<ref>:<PASSWORD>@aws-0-<region>.supabase.com:5432/postgres
```

After deploying, run once locally (with these set):

```bash
npm run db:deploy   # applies migrations
npm run db:seed     # 21 instruments + admin user
```

---

## 2. Supabase Realtime — REQUIRED for live messenger ✅ needs you

Same project, *Project Settings → API*:

```env
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon public key>
SUPABASE_SERVICE_ROLE_KEY=<service_role key>   # ⚠️ SERVER ONLY — never expose
REALTIME_PROVIDER=supabase
NEXT_PUBLIC_REALTIME_PROVIDER=supabase
```

Enable Realtime: *Database → Replication → supabase_realtime* (on by default).

Without these the app still runs — messenger just falls back to refetching
instead of pushing live.

---

## 3. Meetings (LiveKit) — REQUIRED for video ✅ needs you

Free tier at https://cloud.livekit.io → *Create project* → *Settings → Keys*:

```env
LIVEKIT_URL=wss://<your-project>.livekit.cloud
LIVEKIT_API_KEY=APIxxxxxxxxxx
LIVEKIT_API_SECRET=xxxxxxxxxxxxxxxxxxxxxxxx
```

Without these, joining a meeting returns an honest **503 "setup required"** and
the host can still paste an external Google Meet link. No fake "joined" state.

---

## 4. Market data — optional (demo works today)

The **chart itself is live** via the TradingView widget — no key needed.
The watchlist *quotes* are simulated demo data unless you add a free key:

```env
# pick ONE (both have free tiers)
MARKET_DATA_PROVIDER=twelvedata
TWELVE_DATA_API_KEY=          # https://twelvedata.com  (free: 8 req/min)

# or
MARKET_DATA_PROVIDER=alphavantage
ALPHA_VANTAGE_API_KEY=        # https://www.alphavantage.co  (free: 25 req/day)
```

---

## 5. Cron / background jobs — REQUIRED ✅ needs you

```env
CRON_SECRET=<openssl rand -hex 32>
```

`vercel.json` already schedules `/api/jobs/run` once daily.

⚠️ **Vercel Hobby caps cron jobs at once per day**, so meeting reminders
(15 min before) and price alerts will be late. For timely alerts, upgrade to
**Pro** and change the schedule in `vercel.json` to `*/5 * * * *`.

---

## 6. File uploads on Vercel — REQUIRED

Vercel's filesystem is ephemeral; local uploads vanish on redeploy.

```env
STORAGE_PROVIDER=s3
S3_BUCKET=<bucket>
S3_REGION=<region>
S3_ENDPOINT=<endpoint>          # Supabase: https://<ref>.supabase.co/storage/v1/s3
S3_ACCESS_KEY_ID=<key>
S3_SECRET_ACCESS_KEY=<secret>
S3_PUBLIC_URL=https://<ref>.supabase.co/storage/v1/object/public/<bucket>
```

---

## 7. Auth secrets — REQUIRED ✅ generate yourself

```bash
openssl rand -hex 32   # → AUTH_SECRET   (min 16 chars)
openssl rand -hex 32   # → ENCRYPTION_KEY (64 hex chars = AES-256)
```

```env
AUTH_SECRET=
ENCRYPTION_KEY=
APP_URL=https://<your-vercel-domain>     # no trailing slash
NODE_ENV=production
ADMIN_EMAIL=admin@arjun.local
ADMIN_PASSWORD="<a strong password>"     # quote it if it has # or spaces
```

---

## Already done in code (nothing to configure)

- ✅ Live chart fixed and rendering (TradingView official embed)
- ✅ Realtime transport is pluggable: Socket.IO on a Node host, Supabase on Vercel
- ✅ `/api/jobs/run` cron endpoint, protected by `CRON_SECRET`
- ✅ CSP widened for `tradingview-widget.com`
- ✅ 59 tests passing, `next build` clean, `tsc --noEmit` clean
