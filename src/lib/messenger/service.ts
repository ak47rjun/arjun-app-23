/** Messenger domain service — shared by REST routes and the WebSocket server. */
import { prisma } from '../prisma';
import { badRequest, forbidden, notFound } from '../api';
import type { Message, MessageType, Prisma } from '@prisma/client';

export type MessageWithSender = Message & {
  sender: { id: string; displayName: string | null; name: string | null; avatarUrl: string | null };
  reactions: { emoji: string; userId: string }[];
  replyTo?: { id: string; content: string | null; sender: { id: string; displayName: string | null } } | null;
  attachment?: { id: string; url: string; filename: string; mimeType: string; size: number; kind: string } | null;
  chartShare?: { id: string; title: string; symbol: string; timeframe: string; linkToken: string; bias: string | null } | null;
};

export async function isBlocked(a: string, b: string): Promise<boolean> {
  const block = await prisma.block.findFirst({
    where: { OR: [{ blockerId: a, blockedId: b }, { blockerId: b, blockedId: a }] },
  });
  return Boolean(block);
}

export async function getConversationForUser(conversationId: string, userId: string) {
  const membership = await prisma.conversationMember.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
    include: { conversation: true },
  });
  return membership;
}

export async function assertConversationMember(conversationId: string, userId: string) {
  const membership = await getConversationForUser(conversationId, userId);
  if (!membership) throw forbidden('You are not a member of this conversation');
  return membership;
}

export async function getOrCreateDm(userId: string, otherUserId: string) {
  if (userId === otherUserId) throw badRequest('Cannot start a conversation with yourself');
  const other = await prisma.user.findUnique({ where: { id: otherUserId } });
  if (!other) throw notFound('User not found');
  if (await isBlocked(userId, otherUserId)) throw forbidden('You cannot message this user');

  // find existing DM between the two
  const existing = await prisma.conversationMember.findMany({
    where: { userId, conversation: { type: 'DM' } },
    include: {
      conversation: {
        include: {
          members: { where: { userId: otherUserId } },
        },
      },
    },
  });
  const match = existing.find((m) => m.conversation.members.length > 0);
  if (match) return match.conversation;

  const conversation = await prisma.conversation.create({
    data: {
      type: 'DM',
      createdById: userId,
      members: { create: [{ userId }, { userId: otherUserId }] },
    },
  });
  return conversation;
}

export async function listConversations(userId: string) {
  const memberships = await prisma.conversationMember.findMany({
    where: { userId },
    include: {
      conversation: {
        include: {
          members: {
            include: { user: { select: { id: true, displayName: true, name: true, avatarUrl: true } } },
          },
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            include: { sender: { select: { id: true, displayName: true, name: true } } },
          },
        },
      },
    },
    orderBy: { conversation: { updatedAt: 'desc' } },
  });

  return memberships.map((m) => {
    const c = m.conversation;
    const lastMessage = c.messages[0] ?? null;
    return {
      id: c.id,
      type: c.type,
      name: c.name,
      avatarUrl: c.avatarUrl,
      groupId: c.groupId,
      updatedAt: c.updatedAt,
      pinned: m.pinned,
      muted: m.mutedUntil ? m.mutedUntil > new Date() : false,
      lastReadAt: m.lastReadAt,
      members: c.members.map((mem) => mem.user),
      lastMessage: lastMessage
        ? {
            id: lastMessage.id,
            content: lastMessage.content,
            type: lastMessage.type,
            createdAt: lastMessage.createdAt,
            sender: lastMessage.sender,
          }
        : null,
      unreadCount: 0, // computed below
    };
  });
}

export async function listConversationsWithUnread(userId: string) {
  const conversations = await listConversations(userId);
  return Promise.all(
    conversations.map(async (c) => {
      const unreadCount = await prisma.message.count({
        where: {
          conversationId: c.id,
          createdAt: { gt: c.lastReadAt ?? new Date(0) },
          senderId: { not: userId },
          deletedAt: null,
        },
      });
      return { ...c, unreadCount };
    }),
  );
}

export interface CreateMessageInput {
  conversationId: string;
  senderId: string;
  content?: string;
  type?: MessageType;
  attachmentId?: string;
  chartShareId?: string;
  replyToId?: string;
  clientKey?: string;
}

const messageInclude = {
  sender: { select: { id: true, displayName: true, name: true, avatarUrl: true } },
  reactions: { select: { emoji: true, userId: true } },
  replyTo: { select: { id: true, content: true, sender: { select: { id: true, displayName: true } } } },
  attachment: { select: { id: true, url: true, filename: true, mimeType: true, size: true, kind: true } },
  chartShare: { select: { id: true, title: true, symbol: true, timeframe: true, linkToken: true, bias: true } },
} satisfies Prisma.MessageInclude;

export async function createMessage(input: CreateMessageInput): Promise<MessageWithSender> {
  const membership = await assertConversationMember(input.conversationId, input.senderId);
  if (membership.conversation.type === 'DM') {
    const other = await prisma.conversationMember.findFirst({
      where: { conversationId: input.conversationId, userId: { not: input.senderId } },
    });
    if (other && (await isBlocked(input.senderId, other.userId))) {
      throw forbidden('You cannot message this user');
    }
  }

  // idempotency: same clientKey in the same conversation returns the original message
  if (input.clientKey) {
    const existing = await prisma.message.findUnique({
      where: { conversationId_clientKey: { conversationId: input.conversationId, clientKey: input.clientKey } },
      include: messageInclude,
    });
    if (existing) return existing as MessageWithSender;
  }

  const type = input.type ?? (input.attachmentId ? 'ATTACHMENT' : input.chartShareId ? 'CHART_SHARE' : 'TEXT');
  if (type === 'TEXT' && !input.content?.trim()) throw badRequest('Message content is required');
  if (type === 'ATTACHMENT' && !input.attachmentId) throw badRequest('attachmentId is required');
  if (type === 'CHART_SHARE' && !input.chartShareId) throw badRequest('chartShareId is required');

  if (input.attachmentId) {
    const attachment = await prisma.attachment.findUnique({ where: { id: input.attachmentId } });
    if (!attachment || attachment.uploaderId !== input.senderId) throw badRequest('Invalid attachment');
  }
  if (input.chartShareId) {
    const share = await prisma.chartShare.findUnique({ where: { id: input.chartShareId } });
    if (!share || share.ownerId !== input.senderId) throw badRequest('You can only share your own charts');
  }
  if (input.replyToId) {
    const replyTo = await prisma.message.findUnique({ where: { id: input.replyToId } });
    if (!replyTo || replyTo.conversationId !== input.conversationId) throw badRequest('Invalid reply target');
  }

  const message = await prisma.message.create({
    data: {
      conversationId: input.conversationId,
      senderId: input.senderId,
      content: input.content?.trim() || null,
      type,
      attachmentId: input.attachmentId,
      chartShareId: input.chartShareId,
      replyToId: input.replyToId,
      clientKey: input.clientKey,
    },
    include: messageInclude,
  });

  await prisma.conversation.update({
    where: { id: input.conversationId },
    data: { updatedAt: new Date() },
  });

  return message as MessageWithSender;
}

export async function listMessages(conversationId: string, userId: string, opts: { cursor?: string; limit?: number } = {}) {
  await assertConversationMember(conversationId, userId);
  const limit = Math.min(opts.limit ?? 50, 100);
  // Deleted messages are returned as placeholders ("Message deleted") —
  // delete is a delete-for-everyone soft delete, visible to all members.
  const messages = await prisma.message.findMany({
    where: { conversationId, ...(opts.cursor ? { createdAt: { lt: new Date(opts.cursor) } } : {}) },
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: messageInclude,
  });
  return messages.reverse() as MessageWithSender[];
}

export async function editMessage(messageId: string, userId: string, content: string) {
  const message = await prisma.message.findUnique({ where: { id: messageId } });
  if (!message) throw notFound('Message not found');
  if (message.senderId !== userId) throw forbidden('You can only edit your own messages');
  if (message.deletedAt) throw badRequest('Message was deleted');
  return prisma.message.update({
    where: { id: messageId },
    data: { content: content.trim(), editedAt: new Date() },
    include: messageInclude,
  });
}

export async function deleteMessage(messageId: string, userId: string, isModerator = false) {
  const message = await prisma.message.findUnique({ where: { id: messageId } });
  if (!message) throw notFound('Message not found');
  if (message.senderId !== userId && !isModerator) throw forbidden('You can only delete your own messages');
  return prisma.message.update({
    where: { id: messageId },
    data: { deletedAt: new Date(), content: null, attachmentId: null, chartShareId: null },
    include: messageInclude,
  });
}

export async function toggleReaction(messageId: string, userId: string, emoji: string) {
  const message = await prisma.message.findUnique({ where: { id: messageId } });
  if (!message) throw notFound('Message not found');
  if (message.deletedAt) throw badRequest('Cannot react to a deleted message');
  await assertConversationMember(message.conversationId, userId);
  const existing = await prisma.messageReaction.findUnique({
    where: { messageId_userId_emoji: { messageId, userId, emoji } },
  });
  if (existing) {
    await prisma.messageReaction.delete({ where: { id: existing.id } });
    return { added: false, emoji };
  }
  await prisma.messageReaction.create({ data: { messageId, userId, emoji } });
  return { added: true, emoji };
}

export async function togglePin(messageId: string, userId: string, pinned: boolean, isModerator = false) {
  const message = await prisma.message.findUnique({ where: { id: messageId } });
  if (!message) throw notFound('Message not found');
  const membership = await assertConversationMember(message.conversationId, userId);
  const canPin = message.senderId === userId || membership.role !== 'MEMBER' || isModerator;
  if (!canPin) throw forbidden('Only the sender or an admin can pin messages');
  return prisma.message.update({ where: { id: messageId }, data: { pinned } });
}

export async function markConversationRead(conversationId: string, userId: string, messageId?: string) {
  const membership = await assertConversationMember(conversationId, userId);
  const readAt = messageId
    ? (await prisma.message.findUnique({ where: { id: messageId } }))?.createdAt ?? new Date()
    : new Date();
  if (membership.lastReadAt && membership.lastReadAt >= readAt) return membership;
  return prisma.conversationMember.update({
    where: { conversationId_userId: { conversationId, userId } },
    data: { lastReadAt: readAt },
  });
}

export async function searchMessages(userId: string, query: string, limit = 30) {
  const q = query.trim();
  if (!q) return [];
  const memberships = await prisma.conversationMember.findMany({ where: { userId }, select: { conversationId: true } });
  const ids = memberships.map((m) => m.conversationId);
  if (ids.length === 0) return [];
  return prisma.message.findMany({
    where: { conversationId: { in: ids }, deletedAt: null, content: { contains: q, mode: 'insensitive' } },
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: {
      conversation: { select: { id: true, name: true, type: true } },
      sender: { select: { id: true, displayName: true, name: true } },
    },
  });
}

export async function toggleMute(conversationId: string, userId: string, muted: boolean) {
  await assertConversationMember(conversationId, userId);
  return prisma.conversationMember.update({
    where: { conversationId_userId: { conversationId, userId } },
    data: { mutedUntil: muted ? new Date(Date.now() + 1000 * 60 * 60 * 24 * 3650) : null },
  });
}

export async function addMember(conversationId: string, actorId: string, userId: string) {
  const membership = await assertConversationMember(conversationId, actorId);
  const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (conversation?.type === 'DM') throw badRequest('Cannot add members to a direct message');
  if (membership.role === 'MEMBER') throw forbidden('Only admins can add members');
  if (await isBlocked(actorId, userId)) throw forbidden('You cannot add this user');
  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) throw notFound('User not found');
  await prisma.conversationMember.upsert({
    where: { conversationId_userId: { conversationId, userId } },
    create: { conversationId, userId },
    update: {},
  });
  return prisma.conversation.findUnique({ where: { id: conversationId }, include: { members: { include: { user: true } } } });
}

export async function removeMember(conversationId: string, actorId: string, userId: string) {
  const membership = await assertConversationMember(conversationId, actorId);
  if (userId === actorId) {
    // leaving
    await prisma.conversationMember.delete({ where: { conversationId_userId: { conversationId, userId } } });
    return { left: true };
  }
  if (membership.role === 'MEMBER') throw forbidden('Only admins can remove members');
  await prisma.conversationMember.delete({ where: { conversationId_userId: { conversationId, userId } } });
  return { removed: true };
}
