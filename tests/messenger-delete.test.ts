/**
 * Integration tests for messenger "delete for everyone" semantics, run against
 * the real database. Covers: author-only delete, placeholder visibility in
 * history, edit/reaction guards on deleted messages, and moderator delete.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/prisma';
import { hashPassword } from '@/lib/auth/password';
import * as messenger from '@/lib/messenger/service';

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
let conversationId: string;
let messageId: string;

beforeAll(async () => {
  alice = await makeUser(`del-a-${suffix}@test.arjun`);
  bob = await makeUser(`del-b-${suffix}@test.arjun`);
  const conv = await prisma.conversation.create({
    data: {
      type: 'DM',
      createdById: alice.id,
      members: { create: [{ userId: alice.id, role: 'OWNER' }, { userId: bob.id, role: 'MEMBER' }] },
    },
  });
  conversationId = conv.id;
  const msg = await prisma.message.create({
    data: { conversationId, senderId: alice.id, content: 'hello bob' },
  });
  messageId = msg.id;
});

afterAll(async () => {
  await prisma.user.delete({ where: { id: alice.id } }).catch(() => {});
  await prisma.user.delete({ where: { id: bob.id } }).catch(() => {});
});

describe('delete for everyone', () => {
  it('lets the author delete their own message', async () => {
    const deleted = await messenger.deleteMessage(messageId, alice.id);
    expect(deleted.deletedAt).not.toBeNull();
    expect(deleted.content).toBeNull();
  });

  it('shows the deleted message as a placeholder in history (visible to all)', async () => {
    const history = await messenger.listMessages(conversationId, bob.id);
    const m = history.find((x) => x.id === messageId);
    expect(m).toBeDefined();
    expect(m!.deletedAt).not.toBeNull();
    expect(m!.content).toBeNull();
  });

  it('blocks non-authors from deleting (moderator flag off)', async () => {
    const msg = await prisma.message.create({
      data: { conversationId, senderId: alice.id, content: 'second' },
    });
    await expect(messenger.deleteMessage(msg.id, bob.id, false)).rejects.toMatchObject({ status: 403 });
    // cleanup via author
    await messenger.deleteMessage(msg.id, alice.id);
  });

  it('allows moderators to delete others’ messages', async () => {
    const msg = await prisma.message.create({
      data: { conversationId, senderId: alice.id, content: 'third' },
    });
    const deleted = await messenger.deleteMessage(msg.id, bob.id, true);
    expect(deleted.deletedAt).not.toBeNull();
  });

  it('blocks editing a deleted message', async () => {
    await expect(messenger.editMessage(messageId, alice.id, 'new content')).rejects.toMatchObject({ status: 400 });
  });

  it('blocks reacting to a deleted message', async () => {
    await expect(messenger.toggleReaction(messageId, bob.id, '👍')).rejects.toMatchObject({ status: 400 });
  });

  it('still allows reactions on live messages', async () => {
    const msg = await prisma.message.create({
      data: { conversationId, senderId: alice.id, content: 'live' },
    });
    const r = await messenger.toggleReaction(msg.id, bob.id, '🔥');
    expect(r.added).toBe(true);
    const r2 = await messenger.toggleReaction(msg.id, bob.id, '🔥');
    expect(r2.added).toBe(false);
  });
});
