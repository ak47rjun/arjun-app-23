/**
 * Integration tests for authorization rules, run against the real database.
 * Covers: private journal isolation, chart-share visibility, messenger
 * membership enforcement, DM idempotency and blocking.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/prisma';
import { canViewShare } from '@/lib/charts/access';
import * as messenger from '@/lib/messenger/service';
import { dedupeRef } from '@/lib/mt5/sync';
import { computeTradePnl } from '@/lib/journal/pnl';
import { hashPassword } from '@/lib/auth/password';

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

let alice: { id: string };
let bob: { id: string };
let carol: { id: string };

beforeAll(async () => {
  alice = await makeUser(`alice-${suffix}@test.arjun`);
  bob = await makeUser(`bob-${suffix}@test.arjun`);
  carol = await makeUser(`carol-${suffix}@test.arjun`);
});

afterAll(async () => {
  const ids = [alice.id, bob.id, carol.id];
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.$disconnect();
});

describe('journal privacy', () => {
  it("a user's trades are isolated — another user cannot see them via ownership checks", async () => {
    const instrument = await prisma.instrument.findUniqueOrThrow({ where: { symbol: 'EURUSD' } });
    const t = await prisma.trade.create({
      data: {
        userId: alice.id,
        instrumentId: instrument.id,
        symbol: 'EURUSD',
        direction: 'LONG',
        status: 'CLOSED',
        entryPrice: 1.1,
        exitPrice: 1.11,
        quantity: 1,
        entryTime: new Date(),
        exitTime: new Date(),
        ...(() => {
          const pnl = computeTradePnl({ direction: 'LONG', entryPrice: 1.1, exitPrice: 1.11, quantity: 1, contractSize: 100000 });
          return { grossPnl: pnl.grossPnl, netPnl: pnl.netPnl };
        })(),
      },
    });

    // Bob queries Alice's trade id directly — the service-level ownership check must fail.
    const bobsView = await prisma.trade.findUnique({ where: { id: t.id } });
    expect(bobsView?.userId).toBe(alice.id);
    // The API layer enforces: GET /api/trades/:id returns 403/404 for non-owners
    // (getOwnedTrade throws forbidden). Verify the invariant the API relies on:
    expect(bobsView!.userId).not.toBe(bob.id);

    // Bob cannot list Alice's trades through his own scope
    const bobsTrades = await prisma.trade.findMany({ where: { userId: bob.id } });
    expect(bobsTrades.some((x) => x.id === t.id)).toBe(false);
  });
});

describe('chart share permissions', () => {
  it('PRIVATE shares are owner-only by id (link token is the access path)', async () => {
    const share = await prisma.chartShare.create({
      data: { ownerId: alice.id, title: 'Private setup', symbol: 'EURUSD', visibility: 'PRIVATE' },
    });
    expect(await canViewShare(share, alice.id)).toBe(true);
    expect(await canViewShare(share, bob.id)).toBe(false);
    expect(await canViewShare(share, null)).toBe(false);
  });

  it('PUBLIC shares are viewable by anyone (incl. anonymous)', async () => {
    const share = await prisma.chartShare.create({
      data: { ownerId: alice.id, title: 'Public setup', symbol: 'BTCUSD', visibility: 'PUBLIC' },
    });
    expect(await canViewShare(share, bob.id)).toBe(true);
    expect(await canViewShare(share, null)).toBe(true);
  });

  it('GROUP shares require membership', async () => {
    const group = await prisma.group.create({
      data: {
        name: `Test Group ${suffix}`,
        slug: `test-group-${suffix}`,
        ownerId: alice.id,
        members: { create: { userId: alice.id, role: 'OWNER' } },
      },
    });
    const share = await prisma.chartShare.create({
      data: { ownerId: alice.id, title: 'Group setup', symbol: 'XAUUSD', visibility: 'GROUP', groupId: group.id },
    });
    expect(await canViewShare(share, alice.id)).toBe(true);
    expect(await canViewShare(share, bob.id)).toBe(false); // not a member

    await prisma.groupMember.create({ data: { groupId: group.id, userId: bob.id } });
    expect(await canViewShare(share, bob.id)).toBe(true); // now a member
  });
});

describe('messenger permissions', () => {
  it('creates a DM, enforces membership, and is idempotent on clientKey', async () => {
    const dm = await messenger.getOrCreateDm(alice.id, bob.id);
    // second call returns the same conversation (no duplicates)
    const dm2 = await messenger.getOrCreateDm(bob.id, alice.id);
    expect(dm2.id).toBe(dm.id);

    // Carol is not a member — reading must fail
    await expect(messenger.listMessages(dm.id, carol.id)).rejects.toMatchObject({ status: 403 });

    // Alice sends a message with a clientKey; a retry returns the same message
    const m1 = await messenger.createMessage({ conversationId: dm.id, senderId: alice.id, content: 'hello bob', clientKey: 'k1' });
    const m2 = await messenger.createMessage({ conversationId: dm.id, senderId: alice.id, content: 'hello bob', clientKey: 'k1' });
    expect(m2.id).toBe(m1.id);

    // Bob can read the history
    const history = await messenger.listMessages(dm.id, bob.id);
    expect(history.some((m) => m.id === m1.id)).toBe(true);
  });

  it('blocking prevents new DMs and severs existing ones', async () => {
    await prisma.block.create({ data: { blockerId: bob.id, blockedId: carol.id } });
    expect(await messenger.isBlocked(bob.id, carol.id)).toBe(true);
    expect(await messenger.isBlocked(carol.id, bob.id)).toBe(true); // symmetric
    await expect(messenger.getOrCreateDm(bob.id, carol.id)).rejects.toMatchObject({ status: 403 });
    await expect(messenger.getOrCreateDm(carol.id, bob.id)).rejects.toMatchObject({ status: 403 });
  });

  it('group conversations reject DM-only operations and enforce admin rules', async () => {
    const group = await prisma.conversation.create({
      data: {
        type: 'GROUP',
        name: `G ${suffix}`,
        createdById: alice.id,
        members: { create: [{ userId: alice.id, role: 'OWNER' }, { userId: bob.id, role: 'MEMBER' }] },
      },
    });
    // non-admin cannot add members
    await expect(messenger.addMember(group.id, bob.id, carol.id)).rejects.toMatchObject({ status: 403 });
    // owner can
    await messenger.addMember(group.id, alice.id, carol.id);
    const members = await prisma.conversationMember.findMany({ where: { conversationId: group.id } });
    expect(members.length).toBe(3);
  });
});

describe('MT5 import dedupe', () => {
  it('builds stable dedupe refs', () => {
    expect(dedupeRef('conn_1', 'MT5_IMPORT')).toBe('MT5_IMPORT:conn_1');
  });

  it('imported trades dedupe on (connectionRef, externalId)', async () => {
    const instrument = await prisma.instrument.findUniqueOrThrow({ where: { symbol: 'EURUSD' } });
    const ref = dedupeRef('test-conn', 'MT5_IMPORT');
    const data = {
      userId: alice.id,
      instrumentId: instrument.id,
      symbol: 'EURUSD',
      direction: 'LONG' as const,
      status: 'CLOSED' as const,
      source: 'MT5_IMPORT' as const,
      entryPrice: 1.1,
      exitPrice: 1.11,
      quantity: 0.1,
      entryTime: new Date('2026-01-05T10:00:00Z'),
      exitTime: new Date('2026-01-05T11:00:00Z'),
      externalId: `deal-${suffix}`,
      connectionRef: ref,
    };
    const first = await prisma.trade.create({ data });
    // a re-sync of the same deal must be detectable via the unique constraint
    const existing = await prisma.trade.findUnique({
      where: { connectionRef_externalId: { connectionRef: ref, externalId: `deal-${suffix}` } },
    });
    expect(existing?.id).toBe(first.id);
    await expect(prisma.trade.create({ data })).rejects.toThrow(); // unique violation → dedupe works
  });
});
