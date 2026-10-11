#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# ARJUN deployment helper
#
#   Database → Supabase:      ./scripts/deploy.sh supabase-db
#   Verify DB layer:          ./scripts/deploy.sh verify
#   Web tier → Vercel:        ./scripts/deploy.sh vercel
#   Full server (Railway…):   ./scripts/deploy.sh full-server
#
# Required environment variables per command are listed below.
# NEVER commit real values — pass them inline or via your shell env.
# ─────────────────────────────────────────────────────────────
set -euo pipefail
cd "$(dirname "$0")/.."

cmd="${1:-help}"

case "$cmd" in
  verify)
    echo "▶ Prisma schema validation…"
    npx prisma validate
    echo "▶ Migration status (local dev database)…"
    npx prisma migrate status
    echo "▶ Drift check (migrations vs schema on a scratch database)…"
    SHADOW="postgresql://arjun:arjun_dev_password@localhost:5432/arjun_shadow_check"
    PGPASSWORD=arjun_dev_password psql -h localhost -U arjun -d postgres \
      -c "DROP DATABASE IF EXISTS arjun_shadow_check;" -c "CREATE DATABASE arjun_shadow_check;" >/dev/null
    npx prisma migrate diff \
      --from-migrations prisma/migrations \
      --to-schema-datamodel prisma/schema.prisma \
      --shadow-database-url "$SHADOW"
    echo "✔ Database layer is deploy-ready (migrations exactly reproduce the schema)."
    ;;

  supabase-db)
    # Point the app at your Supabase project and apply everything.
    # Get both strings from: Supabase dashboard → Settings → Database.
    : "${DATABASE_URL:?Set DATABASE_URL — Supabase POOLED connection (pgBouncer, port 6543)}"
    : "${DIRECT_URL:?Set DIRECT_URL — Supabase DIRECT connection (port 5432, used by prisma migrate)}"
    echo "▶ Applying migrations to Supabase (via DIRECT_URL)…"
    npx prisma migrate deploy
    echo "▶ Seeding instruments + admin…"
    npm run db:seed
    echo "✔ Supabase database is ready."
    echo "  Next: set the same DATABASE_URL (+ AUTH_SECRET, ENCRYPTION_KEY, REDIS_URL, APP_URL, …)"
    echo "  as environment variables on your hosting platform."
    ;;

  vercel)
    # Deploy the Next.js web tier to Vercel (Option B in docs/DEPLOYMENT.md).
    # NOTE: Vercel serverless cannot run the custom realtime/job server —
    # see docs/DEPLOYMENT.md for the full architecture options.
    : "${VERCEL_TOKEN:?Set VERCEL_TOKEN — create one at vercel.com → Account → Tokens}"
    export PATH="$HOME/.local/bin:$PATH"
    echo "▶ Pulling production env from Vercel…"
    npx vercel pull --yes --environment=production
    echo "▶ Building…"
    npx vercel build --prod
    echo "▶ Deploying…"
    npx vercel deploy --prebuilt --prod
    ;;

  full-server)
    # Option A: build + start the full custom server (Socket.IO + jobs).
    # Run this on Railway / Render / Fly / any VPS. Requires DATABASE_URL,
    # DIRECT_URL, AUTH_SECRET, ENCRYPTION_KEY, REDIS_URL, APP_URL in the env.
    : "${DATABASE_URL:?Set DATABASE_URL}"
    : "${AUTH_SECRET:?Set AUTH_SECRET (openssl rand -hex 32)}"
    : "${ENCRYPTION_KEY:?Set ENCRYPTION_KEY (openssl rand -hex 32)}"
    echo "▶ Building…"
    npm run build
    echo "▶ Starting ARJUN (custom server: Next + Socket.IO + job runner)…"
    npm start
    ;;

  help|*)
    sed -n '2,12p' "$0"
    ;;
esac
