/**
 * MT5 read-only synchronization.
 *
 * Architecture: ARJUN never talks to an MT5 terminal directly (a browser cannot,
 * and neither should a web server hold the terminal session). A documented
 * bridge service (MT5_BRIDGE_URL — e.g. an Expert-Advisor/gateway holding the
 * terminal connection) performs the sync. ARJUN sends the account login, server
 * and the *investor* (read-only) password over TLS to the bridge, and never
 * stores or accepts the master trading password.
 *
 * If MT5_BRIDGE_URL is not configured, sync jobs fail with a SETUP_REQUIRED
 * error and the UI shows a setup-required state — the platform never pretends
 * an account is connected.
 */
import { prisma } from '../prisma';
import { env, mt5BridgeConfigured } from '../env';
import { decryptSecret } from '../crypto';
import { computeTradePnl } from '../journal/pnl';
import { SetupRequiredError } from '../api';
import type { SyncJob, Mt5Connection } from '@prisma/client';

export interface Mt5BridgeTrade {
  dealId: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  volume: number;
  openPrice: number;
  closePrice: number;
  openTime: string; // ISO
  closeTime: string; // ISO
  profit: number;
  commission?: number;
  swap?: number;
  fee?: number;
  comment?: string;
}

export interface Mt5BridgeAccount {
  login: string;
  balance: number;
  equity: number;
  margin: number;
  freeMargin: number;
  currency: string;
  leverage?: number;
  server?: string;
}

export interface Mt5SyncResult {
  imported: number;
  skipped: number;
  note?: string;
  account: { balance: number; equity: number; margin: number; freeMargin: number };
}

/** Dedupe reference: imported trades are unique per (connection, external deal id). */
export function dedupeRef(connectionId: string, source: string): string {
  return `${source}:${connectionId}`;
}

export function assertBridgeConfigured(): void {
  if (!mt5BridgeConfigured) {
    throw new SetupRequiredError(
      'MT5 connector',
      'No MT5 bridge is configured. Set MT5_BRIDGE_URL (and MT5_BRIDGE_API_KEY) to a documented MT5 gateway service, then retry. See docs/MT5.md.',
    );
  }
}

async function callBridge<T>(path: string, body: unknown): Promise<T> {
  assertBridgeConfigured();
  const res = await fetch(`${env.MT5_BRIDGE_URL!.replace(/\/$/, '')}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(env.MT5_BRIDGE_API_KEY ? { 'x-arjun-bridge-key': env.MT5_BRIDGE_API_KEY } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`MT5 bridge error ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.json() as Promise<T>;
}

/** Run one sync job: pull account + history from the bridge, upsert account & trades. */
export async function runMt5SyncJob(job: SyncJob & { connection: Mt5Connection | null }): Promise<Mt5SyncResult> {
  const connection = job.connection;
  if (!connection) throw new Error('Sync job has no MT5 connection');

  // EA mode: the terminal pushes data to /api/mt5/ingest — there is nothing to poll.
  if (connection.mode === 'EA') {
    return {
      imported: 0,
      skipped: 0,
      note: 'EA push mode — the terminal pushes to /api/mt5/ingest; no bridge poll needed.',
      account: { balance: 0, equity: 0, margin: 0, freeMargin: 0 },
    };
  }

  assertBridgeConfigured();

  const investorPassword = decryptSecret(connection.investorPasswordEnc!);
  const since = job.connection?.lastSyncAt?.toISOString();

  const response = await callBridge<{ account: Mt5BridgeAccount; trades: Mt5BridgeTrade[] }>('/v1/sync', {
    login: connection.login,
    server: connection.server,
    investorPassword, // read-only investor password — never the master password
    since,
    includeOpen: true,
  });

  return applyMt5SyncResult(connection, response.account, response.trades, job.id);
}

/**
 * Shared apply logic: upsert the trading-account snapshot and import trades with
 * dedupe (idempotent per connection + external deal id). Used by both the bridge
 * sync job and the Expert-Advisor ingest endpoint.
 */
export async function applyMt5SyncResult(
  connection: Mt5Connection,
  account: Mt5BridgeAccount,
  trades: Mt5BridgeTrade[],
  batchId: string | null,
): Promise<Mt5SyncResult> {
  // 1. Upsert the trading account
  let tradingAccount = connection.accountId
    ? await prisma.tradingAccount.findUnique({ where: { id: connection.accountId } })
    : await prisma.tradingAccount.findFirst({ where: { mt5Connection: { login: connection.login, server: connection.server } } });

  const accountFields = {
    balance: account.balance,
    equity: account.equity,
    margin: account.margin,
    freeMargin: account.freeMargin,
    currency: account.currency ?? 'USD',
    leverage: account.leverage ?? undefined,
    status: 'ACTIVE' as const,
    lastSyncAt: new Date(),
  };

  if (tradingAccount) {
    tradingAccount = await prisma.tradingAccount.update({ where: { id: tradingAccount.id }, data: accountFields });
  } else {
    tradingAccount = await prisma.tradingAccount.create({
      data: {
        userId: connection.userId,
        name: `MT5 ${connection.login}`,
        broker: 'MetaTrader 5',
        type: 'MT5',
        ...accountFields,
      },
    });
    await prisma.mt5Connection.update({ where: { id: connection.id }, data: { accountId: tradingAccount.id } });
  }

  // 2. Upsert trades with dedupe (idempotent re-syncs)
  let imported = 0;
  let skipped = 0;
  for (const t of trades) {
    const ref = dedupeRef(connection.id, 'MT5_IMPORT');
    const existing = await prisma.trade.findUnique({
      where: { connectionRef_externalId: { connectionRef: ref, externalId: t.dealId } },
    });
    if (existing) {
      skipped += 1;
      continue;
    }

    const instrument = await prisma.instrument.findUnique({ where: { symbol: t.symbol } });
    const contractSize = Number(instrument?.contractSize ?? 1);
    const pnl = computeTradePnl({
      direction: t.direction,
      entryPrice: t.openPrice,
      exitPrice: t.closePrice,
      quantity: t.volume,
      contractSize,
      fees: t.fee ?? 0,
      commission: t.commission ?? 0,
      swap: t.swap ?? 0,
    });

    await prisma.trade.create({
      data: {
        userId: connection.userId,
        accountId: tradingAccount.id,
        instrumentId: instrument?.id,
        symbol: t.symbol,
        direction: t.direction,
        status: 'CLOSED',
        source: 'MT5_IMPORT',
        entryPrice: t.openPrice,
        exitPrice: t.closePrice,
        quantity: t.volume,
        entryTime: new Date(t.openTime),
        exitTime: new Date(t.closeTime),
        fees: t.fee ?? 0,
        commission: t.commission ?? 0,
        swap: t.swap ?? 0,
        grossPnl: pnl.grossPnl,
        netPnl: pnl.netPnl,
        notes: t.comment ?? null,
        externalId: t.dealId,
        connectionRef: ref,
        importBatch: batchId ?? undefined,
      },
    });
    imported += 1;
  }

  await prisma.mt5Connection.update({
    where: { id: connection.id },
    data: { status: 'ACTIVE', lastSyncAt: new Date(), lastError: null },
  });

  return {
    imported,
    skipped,
    account: { balance: account.balance, equity: account.equity, margin: account.margin, freeMargin: account.freeMargin },
  };
}

/** Enqueue a sync job (deduplicated: one pending job per connection). */
export async function enqueueMt5Sync(userId: string, connectionId: string, type: 'MT5_SYNC' | 'MT5_HISTORY' = 'MT5_SYNC') {
  const existing = await prisma.syncJob.findFirst({
    where: { connectionId, status: 'PENDING', type },
  });
  if (existing) return existing;
  return prisma.syncJob.create({
    data: { userId, connectionId, type },
  });
}
