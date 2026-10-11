#!/usr/bin/env bash
# Boot ARJUN against the production Supabase database (verification instance).
# Usage: PORT=3001 ./scripts/start-supabase.sh
set -euo pipefail
cd "$(dirname "$0")/.."
set -a
. ./.env.production
set +a
export APP_URL="${APP_URL:-http://localhost:3001}"
export PORT="${PORT:-3001}"
export REDIS_URL="${REDIS_URL:-redis://localhost:6379}"
export NODE_ENV=production
exec npm start
