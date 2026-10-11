import { z } from 'zod';
import { createHash, randomBytes } from 'crypto';
import { prisma } from '@/lib/prisma';
import { encryptSecret } from '@/lib/crypto';
import { audit } from '@/lib/audit';
import { ApiError, getClientIp, json, SetupRequiredError, withApi } from '@/lib/api';
import { enqueueMt5Sync } from '@/lib/mt5/sync';
import { mt5BridgeConfigured } from '@/lib/env';

export const dynamic = 'force-dynamic'; // API routes read cookies/headers — never prerender

/** List the user's MT5 connections (never returns stored credentials or tokens). */
export const GET = withApi(async (_req, _ctx, user) => {
  const connections = await prisma.mt5Connection.findMany({
    where: { userId: user.id },
    include: {
      account: { select: { id: true, name: true, balance: true, equity: true, currency: true, status: true, lastSyncAt: true } },
      _count: { select: { syncJobs: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  return json({
    connections: connections.map((c) => ({
      id: c.id,
      login: c.login,
      server: c.server,
      mode: c.mode,
      status: c.status,
      lastSyncAt: c.lastSyncAt,
      lastError: c.lastError,
      createdAt: c.createdAt,
      account: c.account
        ? { ...c.account, balance: Number(c.account.balance), equity: Number(c.account.equity) }
        : null,
      syncJobCount: c._count.syncJobs,
    })),
  });
});

const bridgeConnectSchema = z
  .object({
    login: z.string().min(1).max(32),
    server: z.string().min(1).max(128),
    investorPassword: z.string().min(1).max(128),
    accountName: z.string().min(1).max(80).optional(),
  })
  .strict(); // unknown fields (e.g. a masterPassword field) are rejected

const eaConnectSchema = z
  .object({
    login: z.string().min(1).max(32),
    server: z.string().min(1).max(128),
    accountName: z.string().min(1).max(80).optional(),
  })
  .strict();

const connectSchema = z
  .object({
    mode: z.enum(['BRIDGE', 'EA']).default('BRIDGE'),
  })
  .passthrough();

/**
 * Connect an MT5 account. Two modes:
 *
 * - `EA` (recommended): the ARJUN Expert Advisor runs inside your MT5 terminal
 *   and pushes data to ARJUN. No investor password is collected or stored — the
 *   terminal session is already authenticated. A sync token is generated and
 *   returned EXACTLY ONCE (paste it into the EA inputs).
 * - `BRIDGE`: ARJUN polls a bridge service (MT5_BRIDGE_URL) using the investor
 *   (read-only) password, encrypted at rest. The master trading password is
 *   rejected (explicitly, both as a field and as a value) in both modes.
 */
export const POST = withApi(async (req, _ctx, user) => {
  // Read the raw body first so a masterPassword FIELD is rejected explicitly
  // (never stored, never logged, never forwarded).
  const raw: unknown = await req.json().catch(() => null);
  if (raw && typeof raw === 'object' && 'masterPassword' in raw) {
    throw new ApiError(400, 'MASTER_PASSWORD_REJECTED', 'Never submit your master trading password. ARJUN uses the read-only investor password only.');
  }
  const parsed = connectSchema.parse(raw);
  const mode = parsed.mode;
  // strip the discriminator before strict-parsing the mode-specific body
  const { mode: _mode, ...rest } = (raw ?? {}) as Record<string, unknown>;

  if (mode === 'EA') {
    const body = eaConnectSchema.parse(rest);
    // Generate the sync token; only its SHA-256 hash is stored.
    const syncToken = randomBytes(32).toString('hex');
    const syncTokenHash = createHash('sha256').update(syncToken).digest('hex');
    const connection = await prisma.mt5Connection.create({
      data: {
        userId: user.id,
        login: body.login,
        server: body.server,
        mode: 'EA',
        syncTokenHash,
        status: 'DISCONNECTED', // becomes ACTIVE on the first successful EA push
      },
    });
    await audit(user.id, 'MT5_CONNECT', { entity: 'Mt5Connection', entityId: connection.id, metadata: { mode: 'EA' }, ip: getClientIp(req) });
    return json(
      {
        connection: {
          id: connection.id,
          login: connection.login,
          server: connection.server,
          mode: connection.mode,
          status: connection.status,
        },
        // shown exactly once — the user pastes this into the EA inputs
        syncToken,
        eaDownloadUrl: '/downloads/mt5/ARJUN_EA.mq5',
        ingestUrl: '/api/mt5/ingest',
      },
      201,
    );
  }

  // BRIDGE mode (default)
  const body = bridgeConnectSchema.parse(rest);
  if (/master/i.test(body.investorPassword)) {
    throw new ApiError(400, 'MASTER_PASSWORD_REJECTED', 'Never submit your master trading password. ARJUN uses the read-only investor password only.');
  }
  if (!mt5BridgeConfigured) {
    throw new SetupRequiredError('MT5 bridge', 'MT5_BRIDGE_URL is not configured. Deploy the MT5 connector bridge first (see docs/MT5.md) — or use Expert Advisor mode, which needs no bridge. No connection was created.');
  }
  const connection = await prisma.mt5Connection.create({
    data: {
      userId: user.id,
      login: body.login,
      server: body.server,
      investorPasswordEnc: encryptSecret(body.investorPassword),
      mode: 'BRIDGE',
      status: 'DISCONNECTED', // honest initial state: becomes ACTIVE only after a successful sync
    },
  });
  await audit(user.id, 'MT5_CONNECT', { entity: 'Mt5Connection', entityId: connection.id, metadata: { mode: 'BRIDGE' }, ip: getClientIp(req) });
  // enqueue first sync (requires the bridge; failures are recorded on the job)
  await enqueueMt5Sync(user.id, connection.id, 'MT5_HISTORY');
  return json(
    {
      connection: {
        id: connection.id,
        login: connection.login,
        server: connection.server,
        mode: connection.mode,
        status: connection.status,
      },
    },
    201,
  );
});
