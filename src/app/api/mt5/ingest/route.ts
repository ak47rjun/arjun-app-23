import { z } from 'zod';
import { createHash, randomBytes } from 'crypto';
import { prisma } from '@/lib/prisma';
import { json } from '@/lib/api';
import { rateLimit } from '@/lib/ratelimit';
import { applyMt5SyncResult } from '@/lib/mt5/sync';

export const dynamic = 'force-dynamic'; // reads headers/body — never prerender

/**
 * MT5 Expert-Advisor ingest endpoint (EA push mode).
 *
 * The EA runs inside the trader's own MT5 terminal (already authenticated to
 * the broker) and pushes the account snapshot + closed deals here over TLS.
 * It authenticates with a per-connection sync token (Authorization: Bearer …).
 * Only the SHA-256 hash of the token is stored — the token itself is shown to
 * the user exactly once, at connect time. No investor password is ever needed
 * in this mode: it never leaves the trader's terminal.
 *
 * This route is intentionally NOT session-authenticated (the EA has no session);
 * it is allow-listed in the middleware and protected by the bearer token +
 * a per-token rate limit instead.
 */

const dealSchema = z.object({
  dealId: z.string().min(1).max(64),
  symbol: z.string().min(1).max(32),
  direction: z.enum(['LONG', 'SHORT']),
  volume: z.number().positive(),
  openPrice: z.number(),
  closePrice: z.number(),
  openTime: z.string().min(1).max(40),
  closeTime: z.string().min(1).max(40),
  profit: z.number(),
  commission: z.number().optional(),
  swap: z.number().optional(),
});

const ingestSchema = z
  .object({
    account: z.object({
      login: z.string().min(1).max(32),
      balance: z.number(),
      equity: z.number(),
      margin: z.number(),
      freeMargin: z.number(),
      currency: z.string().min(1).max(8),
      leverage: z.number().int().positive().optional(),
    }),
    deals: z.array(dealSchema).max(2000).default([]),
  })
  .strict();

const bad = (status: number, code: string, message: string) => json({ error: code, message }, status);

export async function POST(req: Request) {
  // 1. Bearer sync token
  const auth = req.headers.get('authorization') ?? '';
  const token = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
  if (!token) return bad(401, 'UNAUTHORIZED', 'Missing sync token.');
  const tokenHash = createHash('sha256').update(token).digest('hex');

  // 2. Rate limit per token (the EA pushes at most once a minute)
  const rl = await rateLimit({ key: `mt5-ingest:${tokenHash}`, limit: 30, windowSec: 60 });
  if (!rl.allowed) return bad(429, 'RATE_LIMITED', 'Too many pushes — slow down.');

  // 3. Resolve the connection (hash lookup — constant-time enough at this scale)
  const connection = await prisma.mt5Connection.findFirst({
    where: { syncTokenHash: tokenHash, mode: 'EA' },
  });
  if (!connection) return bad(401, 'UNAUTHORIZED', 'Invalid sync token.');

  // 4. Validate the payload
  const raw: unknown = await req.json().catch(() => null);
  const parse = ingestSchema.safeParse(raw);
  if (!parse.success) {
    return bad(400, 'INVALID_PAYLOAD', `Invalid ingest payload: ${parse.error.issues[0]?.message ?? 'schema mismatch'}`);
  }
  const { account, deals } = parse.data;

  // 5. The pushed account must match the connected account
  if (account.login !== connection.login) {
    return bad(400, 'LOGIN_MISMATCH', `Pushed login ${account.login} does not match the connected account ${connection.login}.`);
  }

  // 6. Apply (same dedupe + import path as the bridge sync)
  try {
    const result = await applyMt5SyncResult(
      connection,
      {
        login: account.login,
        balance: account.balance,
        equity: account.equity,
        margin: account.margin,
        freeMargin: account.freeMargin,
        currency: account.currency,
        leverage: account.leverage,
        server: connection.server,
      },
      deals.map((d) => ({
        dealId: d.dealId,
        symbol: d.symbol,
        direction: d.direction,
        volume: d.volume,
        openPrice: d.openPrice,
        closePrice: d.closePrice,
        openTime: d.openTime,
        closeTime: d.closeTime,
        profit: d.profit,
        commission: d.commission,
        swap: d.swap,
      })),
      `ea:${randomBytes(8).toString('hex')}`,
    );
    return json({ ok: true, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    await prisma.mt5Connection.update({
      where: { id: connection.id },
      data: { status: 'ERROR', lastError: message.slice(0, 500) },
    });
    return bad(500, 'INGEST_FAILED', 'Failed to apply the sync payload.');
  }
}
