# syntax=docker/dockerfile:1
# ─────────────────────────────────────────────────────────────
# ARJUN — full custom server (Next.js + Socket.IO + job runner)
# Multi-stage build. Used by Railway / Render / Fly / any Docker host.
# Secrets come from platform environment variables — never baked in.
# ─────────────────────────────────────────────────────────────

FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# schema needed by the postinstall `prisma generate`
COPY prisma ./prisma
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate && npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
# tsx (runtime TS runner for server.ts) is a production dependency.
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/src ./src
COPY --from=builder /app/server.ts ./server.ts
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/next.config.js ./next.config.js
RUN mkdir -p /app/uploads
# .env is intentionally NOT copied — env comes from the platform.
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/healthz || exit 1
CMD ["npm", "start"]
