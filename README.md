# ARJUN — The Real Trader's Hub

A premium, real, full-stack trading + trader-community platform: trading terminal,
professional trade journal with analytics, realtime messenger, community, MT5
account analytics, and video meetings — in one cinematic dark-emerald
"Liquid Glass" application.

> **Honesty first**: every number in the app comes from real stored records.
> Market data is clearly labeled (demo / delayed / live). Features that need
> external credentials (MT5 bridge, LiveKit, Google OAuth, SMTP, market-data
> API keys) show an explicit **setup-required** state until configured — the
> app never fabricates prices, profits, connections, messages, or calls.

## Stack

- **Next.js 14.2** (App Router, `src/` dir) + **React 18.3** + **TypeScript** (strict) + **Tailwind 3.4**
- **PostgreSQL** + **Prisma 6** (34 tables, migrations, Decimal(24,8), UTC)
- **Redis** (rate limiting, session cache, presence) with in-memory fallback
- **Socket.IO** realtime (messenger, presence, live notifications) on a custom Node server
- **jose** HS256 JWT sessions in HttpOnly cookies + hand-rolled Google OAuth (state + nonce + PKCE)
- **bcryptjs** passwords, optional **TOTP 2FA** (speakeasy + otplib QR flow)
- **LiveKit** for ARJUN Meet (server SDK tokens + client room UI)
- **TradingView Advanced Chart widget** (official free widget — see disclosure below)
- Local file storage with an S3-ready interface (`STORAGE_PROVIDER=local|s3`)
- Background job runner (MT5 sync, watchlist alerts, meeting reminders) in-process

## Quick start

```bash
# 1. Environment
cp .env.example .env        # then edit: secrets, DB, optional integrations

# 2. Database (PostgreSQL must be running)
npm run db:deploy           # prisma migrate deploy
npm run db:seed             # 21 instruments + admin user (idempotent)

# 3. Run (custom server: Next + Socket.IO + job runner on one port)
npm run dev                 # http://localhost:3000

# Production
npm run build && npm start  # NODE_ENV=production, serves the built app
```

**Seeded admin**: `admin@arjun.local` — the password is the `ADMIN_PASSWORD` value
in `.env` (see `.env.example`). If `ADMIN_PASSWORD` is unset, the seed **generates a
strong random password and prints it once** — set `ADMIN_PASSWORD` explicitly for
any shared or production environment. Re-running `npm run db:seed` re-syncs the
admin password to the env value when `ADMIN_PASSWORD` is set.

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Custom server (tsx): Next + Socket.IO + job runner, 0.0.0.0:3000 |
| `npm run build` | Production build (`next build`) |
| `npm start` | Production custom server (uses the build) |
| `npm test` | Vitest suite (journal math, RBAC, DB-backed permissions) |
| `npm run db:deploy` | `prisma migrate deploy` (uses `DIRECT_URL`) |
| `npm run db:seed` | Seed instruments + admin (safe to re-run) |
| `npm run db:studio` | Prisma Studio |

## Roles & permissions

`GUEST < MEMBER < VERIFIED_TRADER < MODERATOR < ADMIN`. Every protected operation
is authorized **server-side** (route wrapper + ownership checks). Users only access
their own journal, MT5 connections, messages and settings unless explicitly
authorized. Admin area is gated by middleware (pages) and the API (JSON 403).

## Features

- **Auth**: email/password, email verification, password reset, Google OAuth,
  optional TOTP 2FA, sign-out-everywhere, onboarding, account deletion + JSON export
- **Dashboard**: real equity/P&L/win-rate/profit-factor/expectancy/drawdown from
  stored trades, equity curve, open trades, upcoming meetings, unread counts
- **Terminal**: TradingView widget with symbol search, watchlists, saved layouts
- **Journal**: manual + MT5-imported trades (dedupe by `connectionRef:externalId`),
  full analytics (win rate, profit factor, expectancy, avg R:R, drawdown, by
  instrument/session/day/setup/strategy, long/short, equity curve, calendar
  heatmap, CSV/PDF export, planned-vs-actual, screenshots)
- **Messenger**: DMs + groups, Socket.IO realtime, presence, typing, read receipts,
  reactions/edit/delete/pin/bookmark, attachments with access validation, search,
  mute/block/report, chart sharing
- **Community**: profiles (privacy-enforced), follow, feed, posts with charts,
  comments, reactions, public/private groups, moderation queue, reports
- **Charts sharing**: PRIVATE (link token) | GROUP (members) | PUBLIC shares at
  `/s/[token]` with snapshots, levels, and community analysis
- **ARJUN Meet**: instant + scheduled meetings, LiveKit rooms (mic/cam/screenshare),
  lobby, host controls; external link (e.g. Google Meet) as an optional fallback
- **MT5 analytics**: connect via investor (read-only) password only — master
  password is rejected at the API; AES-256-GCM at rest; background sync with
  dedupe; setup-required state when no bridge is configured
- **Notifications**: in-app (realtime) + preferences; email when SMTP is set
- **Admin**: users/roles, verification badges, moderation queue, reports, audit
  logs, system health, integration status

## Market data disclosure

The default provider is a **labeled demo provider** (simulated prices — not real
market data). Set `MARKET_DATA_PROVIDER=twelvedata` + `TWELVE_DATA_API_KEY` or
`alphavantage` + `ALPHA_VANTAGE_API_KEY` for real (delayed/free-tier) data. The UI
always shows the provider name and mode.

**TradingView**: the terminal embeds the officially supported free Advanced Chart
widget. The free widget ships TradingView's own (often delayed) data; embedding a
chart does **not** grant a TradingView data license or broker connectivity. For a
licensed datafeed, point `TV_DATAFEED_URL` at your authorized implementation.

## Security

- HttpOnly + SameSite=Lax session cookies (`Secure` in production), 7-day sessions
  stored server-side (revocable)
- CSRF origin check on all mutating requests
- Redis-backed rate limiting (auth, market data, uploads, messaging)
- Zod validation on every endpoint; upload mime/size whitelists
- Secrets encrypted at rest (AES-256-GCM); never logged; never sent to the client
- Audit log for sensitive actions; consent flags for AI/data processing

## Deployment

See **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** (Vercel + Supabase blueprints)
and **[docs/SUPABASE.md](docs/SUPABASE.md)**. The app is Supabase-ready
(`DATABASE_URL` pooled + `DIRECT_URL` direct for migrations). Because ARJUN runs a
custom server (Socket.IO + background jobs), the recommended production topology
is a full Node host (Railway/Render/Fly/VPS) with Supabase Postgres; a pure-Vercel
deployment requires the realtime/jobs refactor described in the docs.

## Project layout

```
server.ts                  custom server entry (Next + Socket.IO + job runner)
prisma/                    schema (34 models), migrations, seed
src/lib/                   env, prisma, redis, auth, rbac, api, journal math,
                           messenger, notifications, market providers, mt5, meet…
src/server/                realtime.ts (socket.io), jobs.ts (background runner)
src/app/                   Next app router: (marketing), (auth), (app), api/ (86 routes)
src/components/            ui.tsx design system (server-safe), layout, landing globe…
tests/                     vitest: journal math, RBAC, DB permission integration tests
docs/                      DEPLOYMENT.md, SUPABASE.md, MT5.md, MEETINGS.md
```

## Testing

```bash
npm test          # 32 tests: P&L math, stats, RBAC, chart-share access,
                  # messenger membership/idempotency/blocking, MT5 dedupe
```

## License

Proprietary — built as a real product. Not financial advice; trading involves
risk. Review/regulatory compliance (e.g. if you monetize trader data) requires
your own legal review.
