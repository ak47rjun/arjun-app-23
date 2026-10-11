/** Notification service: persists in-app notifications and pushes them over Socket.IO. */
import { prisma } from '../prisma';
import type { NotificationType, Prisma } from '@prisma/client';

// The Socket.IO server instance is registered by src/server/realtime.ts at boot.
// NOTE: the custom server (server.ts, via tsx) and the Next.js route handlers
// (compiled .next chunks) load SEPARATE module instances of this file in the
// same process — so the emitter is also mirrored on globalThis to be visible
// from both module graphs.
type EmitFn = (room: string, event: string, payload: unknown) => void;
const EMITTER_GLOBAL = '__ARJUN_NOTIFICATION_EMITTER__';
let emitFn: EmitFn | null = null;

export function registerNotificationEmitter(fn: EmitFn): void {
  emitFn = fn;
  (globalThis as Record<string, unknown>)[EMITTER_GLOBAL] = fn;
}

function getEmitFn(): EmitFn | null {
  return emitFn ?? ((globalThis as Record<string, unknown>)[EMITTER_GLOBAL] as EmitFn | undefined) ?? null;
}

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
  const emitter = getEmitFn();
  if (emitter) {
    emitter(`user:${input.userId}`, 'notification:new', notification);
  }
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
