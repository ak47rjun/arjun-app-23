/** Notification service: persists in-app notifications and pushes them over Socket.IO. */
import { prisma } from '../prisma';
import { emitToUserNow } from '../realtime/server';
import type { NotificationType, Prisma } from '@prisma/client';

/**
 * Pushes go through the realtime fan-out in src/lib/realtime/server.ts, which
 * picks Socket.IO (Node host) or Supabase Realtime (serverless) automatically.
 * Previously this module held a direct Socket.IO emitter, which silently did
 * nothing once the app ran somewhere without a WebSocket server.
 */

export interface CreateNotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string;
  data?: Record<string, unknown>;
}

const DEFAULT_IN_APP: Record<NotificationType, boolean> = {
  MESSAGE: true,
  MENTION: true,
  REACTION: true,
  CHART_SHARE: true,
  MEETING_INVITE: true,
  FOLLOW: true,
  ALERT: true,
  SYNC_FAILURE: true,
  REPORT: true,
  SYSTEM: true,
};

export async function createNotification(input: CreateNotificationInput) {
  const prefs = await prisma.notificationPrefs.findUnique({ where: { userId: input.userId } });
  const inAppPrefs = (prefs?.inApp ?? {}) as Record<string, boolean>;
  const enabled = inAppPrefs[input.type] ?? DEFAULT_IN_APP[input.type] ?? true;
  if (!enabled) return null;

  const notification = await prisma.notification.create({
    data: {
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body,
      data: (input.data ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
  emitToUserNow(input.userId, 'notification:new', notification);
  return notification;
}

export async function createNotifications(inputs: CreateNotificationInput[]) {
  for (const input of inputs) {
    await createNotification(input).catch((e) => console.error('[notifications]', e));
  }
}

export async function getUnreadCount(userId: string): Promise<number> {
  return prisma.notification.count({ where: { userId, readAt: null } });
}

export async function markAllRead(userId: string): Promise<void> {
  await prisma.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
}
