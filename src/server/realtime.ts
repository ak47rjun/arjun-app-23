/**
 * ARJUN realtime server — Socket.IO attached to the same HTTP server as Next.js.
 * Handles authenticated messaging, typing indicators, read receipts, reactions,
 * presence, and pushes notifications. All events are authorized server-side.
 */
import type { Server as HttpServer } from 'http';
import { Server, type Socket } from 'socket.io';
import { getCookie, SESSION_COOKIE } from '../lib/auth/cookies';
import { verifySessionToken } from '../lib/auth/jwt';
import { prisma } from '../lib/prisma';
import { redisSAdd, redisSRem, redisSMembers, redisSet, redisGet } from '../lib/redis';
import { isTrustedOrigin } from '../lib/security/origins';
import * as messenger from '../lib/messenger/service';
import { createNotifications } from '../lib/notifications/service';
import { env } from '../lib/env';

const PRESENCE_KEY = 'arjun:presence';

// NOTE: the custom server (server.ts, via tsx) and the Next.js route handlers
// (compiled .next chunks) load SEPARATE module instances of this file in the
// same process. The io instance created by attachRealtime() is therefore also
// mirrored on globalThis so route handlers (a different module graph) can emit.
const IO_GLOBAL = '__ARJUN_SOCKET_IO__';
let io: Server | null = null;

export function getIO(): Server | null {
  return io ?? ((globalThis as Record<string, unknown>)[IO_GLOBAL] as Server | undefined) ?? null;
}

export function emitToUser(userId: string, event: string, payload: unknown): void {
  getIO()?.to(`user:${userId}`).emit(event, payload);
}

export function emitToConversation(conversationId: string, event: string, payload: unknown): void {
  getIO()?.to(`conversation:${conversationId}`).emit(event, payload);
}

interface AuthedSocket extends Socket {
  data: { user: { id: string; displayName: string | null; role: string } } & Socket['data'];
}

export function attachRealtime(server: HttpServer): Server {
  io = new Server(server, {
    path: '/api/socket',
    cors: { origin: new URL(env.APP_URL).origin, credentials: true },
    maxHttpBufferSize: 1e6,
  });
  (globalThis as Record<string, unknown>)[IO_GLOBAL] = io;

  // ── authentication middleware ──
  io.use(async (socket: Socket, next) => {
    try {
      // Reject cross-site origins before anything else (Fetch Metadata +
      // trusted-origin check — see src/lib/security/origins.ts).
      const headers = new Headers(socket.handshake.headers as HeadersInit);
      if (!isTrustedOrigin(headers.get('origin'), { headers })) {
        return next(new Error('unauthorized'));
      }
      const header = socket.handshake.headers.cookie ?? '';
      const match = header.split(';').map((p) => p.trim()).find((p) => p.startsWith(`${SESSION_COOKIE}=`));
      const token = match ? decodeURIComponent(match.slice(SESSION_COOKIE.length + 1)) : null;
      if (!token) return next(new Error('unauthorized'));
      const payload = await verifySessionToken(token);
      if (!payload) return next(new Error('unauthorized'));
      const session = await prisma.session.findUnique({ where: { id: payload.sid } });
      if (!session || session.userId !== payload.sub) return next(new Error('unauthorized'));
      const user = await prisma.user.findUnique({ where: { id: payload.sub } });
      if (!user || user.isBanned) return next(new Error('unauthorized'));
      (socket as AuthedSocket).data = {
        ...socket.data,
        user: { id: user.id, displayName: user.displayName ?? user.name, role: user.role },
      };
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const authed = socket as AuthedSocket;
    const userId = authed.data.user.id;
    void userId;

    const joinRooms = async () => {
      const uid = authed.data.user.id;
      socket.join(`user:${uid}`);
      const memberships = await prisma.conversationMember.findMany({
        where: { userId: uid },
        select: { conversationId: true },
      });
      for (const m of memberships) socket.join(`conversation:${m.conversationId}`);
      await redisSAdd(PRESENCE_KEY, uid);
      await redisSet(`presence:seen:${uid}`, String(Date.now()), 120);
    };
    void joinRooms();

    // broadcast presence to conversation peers
    const broadcastPresence = async (online: boolean) => {
      const uid = authed.data.user.id;
      const memberships = await prisma.conversationMember.findMany({
        where: { userId: uid },
        select: { conversationId: true },
      });
      for (const m of memberships) {
        socket.to(`conversation:${m.conversationId}`).emit('presence:update', { userId: uid, online });
      }
    };
    void broadcastPresence(true);

    socket.on('conversation:join', async (conversationId: string) => {
      try {
        await messenger.assertConversationMember(conversationId, authed.data.user.id);
        socket.join(`conversation:${conversationId}`);
      } catch {
        /* not a member */
      }
    });

    socket.on('message:send', async (payload: messenger.CreateMessageInput, ack?: (res: unknown) => void) => {
      try {
        const message = await messenger.createMessage({ ...payload, senderId: authed.data.user.id });
        emitToConversation(message.conversationId, 'message:new', message);
        // notify other members
        const members = await prisma.conversationMember.findMany({
          where: { conversationId: message.conversationId, userId: { not: authed.data.user.id } },
        });
        await createNotifications(
          members.map((m) => ({
            userId: m.userId,
            type: 'MESSAGE' as const,
            title: 'New message',
            body: message.content ?? (message.type === 'CHART_SHARE' ? 'Shared a chart' : message.type === 'ATTACHMENT' ? 'Sent an attachment' : 'New message'),
            data: { conversationId: message.conversationId, messageId: message.id },
          })),
        );
        ack?.({ ok: true, message });
      } catch (e) {
        ack?.({ ok: false, error: e instanceof Error ? e.message : 'Failed to send' });
      }
    });

    socket.on('message:typing', (payload: { conversationId: string; isTyping: boolean }) => {
      socket.to(`conversation:${payload.conversationId}`).emit('message:typing', {
        conversationId: payload.conversationId,
        userId: authed.data.user.id,
        isTyping: payload.isTyping,
      });
    });

    socket.on('message:read', async (payload: { conversationId: string; messageId?: string }) => {
      try {
        await messenger.markConversationRead(payload.conversationId, authed.data.user.id, payload.messageId);
        socket.to(`conversation:${payload.conversationId}`).emit('message:read', {
          conversationId: payload.conversationId,
          userId: authed.data.user.id,
          messageId: payload.messageId,
        });
      } catch {
        /* ignore */
      }
    });

    socket.on('message:react', async (payload: { messageId: string; emoji: string }) => {
      try {
        const result = await messenger.toggleReaction(payload.messageId, authed.data.user.id, payload.emoji);
        const message = await prisma.message.findUnique({ where: { id: payload.messageId } });
        if (message) {
          emitToConversation(message.conversationId, 'message:reaction', {
            messageId: payload.messageId,
            ...result,
            userId: authed.data.user.id,
          });
        }
      } catch {
        /* ignore */
      }
    });

    socket.on('message:edit', async (payload: { messageId: string; content: string }, ack?: (res: unknown) => void) => {
      try {
        const message = await messenger.editMessage(payload.messageId, authed.data.user.id, payload.content);
        emitToConversation(message.conversationId, 'message:edited', message);
        ack?.({ ok: true });
      } catch (e) {
        ack?.({ ok: false, error: e instanceof Error ? e.message : 'Failed to edit' });
      }
    });

    socket.on('message:delete', async (payload: { messageId: string }, ack?: (res: unknown) => void) => {
      try {
        const message = await messenger.deleteMessage(payload.messageId, authed.data.user.id, authed.data.user.role === 'ADMIN' || authed.data.user.role === 'MODERATOR');
        emitToConversation(message.conversationId, 'message:deleted', { messageId: message.id, conversationId: message.conversationId });
        ack?.({ ok: true });
      } catch (e) {
        ack?.({ ok: false, error: e instanceof Error ? e.message : 'Failed to delete' });
      }
    });

    socket.on('presence:watch', async (userIds: string[], ack?: (res: { online: string[] }) => void) => {
      const online = await redisSMembers(PRESENCE_KEY);
      ack?.({ online: userIds.filter((id) => online.includes(id)) });
    });

    socket.on('disconnect', () => {
      void (async () => {
        const uid = authed.data.user.id;
        const lastSeen = await redisGet(`presence:seen:${uid}`);
        // only mark offline if no other connection refreshed presence recently
        if (lastSeen && Date.now() - Number(lastSeen) > 30000) {
          await redisSRem(PRESENCE_KEY, uid);
          void broadcastPresence(false);
        }
      })();
    });
  });

  return io;
}
