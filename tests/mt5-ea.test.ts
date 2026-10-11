/**
 * Integration tests for the MT5 Expert-Advisor push mode (EA ingest endpoint),
 * run against the real database. Covers: bearer-token auth, payload validation,
 * login matching, trade import with dedupe, and the account snapshot upsert.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHash, randomBytes } from 'crypto';
import { prisma } from '@/lib/prisma';
import { hashPassword } from '@/lib/auth/password';
import { POST } from '@/app/api/mt5/ingest/route';

const suffix = Math.random().toString(36).slice(2, 10);

async function makeUser(email: string) {
  return prisma.user.create({
    data: {
      email,
      passwordHash: await hashPassword('TestPassword#123'),
      displayName: email.split('@')[0],
      profile: { create: {} },
      settings: { create: {} },
      notificationPrefs: { create: {} },
    },
  });
}

function makeRequest(token: string | null, body: unknown): Request {
  return new Request('http://localhost/api/mt5/ingest', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === null ? undefined : JSON.stringify(body),
  });
}

const accountPayload = (login: string) => ({
  account: {
    login,
    balance: 10000,
    equity: 10250.5,
    margin: 120,
    freeMargin: 10130.5,
    currency: 'USD',
    leverage: 100,
  },
});

const deal = (id: string, symbol = 'EURUSD') => ({
  dealId: id,
  symbol,
  direction: 'LONG',
  volume: 0.1,
  openPrice: 1.085,
  closePrice: 1.086,
  openTime: '2026-10-09T10:00:00Z',
  closeTime: '2026-10-09T11:00:00Z',
  profit: 10,
  commission: -0.7,
  swap: 0,
});

let user: { id: string };
let token: string;
let connectionId: string;
const LOGIN = '108518884';

beforeAll(async () => {
  user = await makeUser(`ea-${suffix}@test.arjun`);
  token = randomBytes(32).toString('hex');
  const conn = await prisma.mt5Connection.create({
    data: {
      userId: user.id,
      login: LOGIN,
      server: 'XMGlobal-MT5 5',
      mode: 'EA',
      syncTokenHash: createHash('sha256').update(token).digest('hex'),
      status: 'DISCONNECTED',
    },
  });
  connectionId = conn.id;
});

afterAll(async () => {
  await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
});

describe('MT5 EA ingest endpoint', () => {
  it('rejects a missing token with 401', async () => {
    const res = await POST(makeRequest(null, accountPayload(LOGIN)));
    expect(res.status).toBe(401);
  });

  it('rejects an invalid token with 401', async () => {
    const res = await POST(makeRequest('wrong-token', accountPayload(LOGIN)));
    expect(res.status).toBe(401);
  });

  it('rejects an invalid payload with 400', async () => {
    const res = await POST(makeRequest(token, { account: { nope: true } }));
    expect(res.status).toBe(400);
  });

  it('rejects a login mismatch with 400', async () => {
    const res = await POST(makeRequest(token, accountPayload('999999')));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('LOGIN_MISMATCH');
  });

  it('accepts an account-only push and activates the connection', async () => {
    const res = await POST(makeRequest(token, accountPayload(LOGIN)));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.imported).toBe(0);

    const conn = await prisma.mt5Connection.findUnique({ where: { id: connectionId } });
    expect(conn?.status).toBe('ACTIVE');
    expect(conn?.lastSyncAt).not.toBeNull();

    const account = await prisma.tradingAccount.findFirst({ where: { userId: user.id } });
    expect(account).not.toBeNull();
    expect(Number(account?.equity)).toBeCloseTo(10250.5, 2);
    expect(account?.currency).toBe('USD');
  });

  it('imports deals and dedupes on re-push', async () => {
    const payload = { ...accountPayload(LOGIN), deals: [deal('deal-1'), deal('deal-2', 'BTCUSD')] };
    const first = await POST(makeRequest(token, payload));
    expect(first.status).toBe(200);
    const firstBody = await first.json();
    expect(firstBody.imported).toBe(2);
    expect(firstBody.skipped).toBe(0);

    // re-push the same deals → all skipped (idempotent)
    const second = await POST(makeRequest(token, payload));
    expect(second.status).toBe(200);
    const secondBody = await second.json();
    expect(secondBody.imported).toBe(0);
    expect(secondBody.skipped).toBe(2);

    const trades = await prisma.trade.findMany({ where: { userId: user.id, source: 'MT5_IMPORT' } });
    expect(trades).toHaveLength(2);
    const eurusd = trades.find((t) => t.symbol === 'EURUSD');
    expect(eurusd?.externalId).toBe('deal-1');
    expect(eurusd?.connectionRef).toBe(`MT5_IMPORT:${connectionId}`);
    expect(eurusd?.status).toBe('CLOSED');
    expect(Number(eurusd?.netPnl)).toBeGreaterThan(0);
  });

  it('does not import another user’s deals into this connection', async () => {
    // a second user with their own EA connection must not see user 1's trades
    const other = await makeUser(`ea-other-${suffix}@test.arjun`);
    const otherToken = randomBytes(32).toString('hex');
    await prisma.mt5Connection.create({
      data: {
        userId: other.id,
        login: '555',
        server: 'XMGlobal-MT5 5',
        mode: 'EA',
        syncTokenHash: createHash('sha256').update(otherToken).digest('hex'),
      },
    });
    const res = await POST(makeRequest(otherToken, accountPayload('555')));
    expect(res.status).toBe(200);
    const otherTrades = await prisma.trade.findMany({ where: { userId: other.id, source: 'MT5_IMPORT' } });
    expect(otherTrades).toHaveLength(0);
    await prisma.user.delete({ where: { id: other.id } }).catch(() => {});
  });
});
