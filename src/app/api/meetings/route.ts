import { z } from 'zod';
import { nanoid } from 'nanoid';
import { prisma } from '@/lib/prisma';
import { json, parseBody, withApi } from '@/lib/api';

export const dynamic = 'force-dynamic'; // API routes read cookies/headers — never prerender

/** List my meetings (hosted + invited). */
export const GET = withApi(async (_req, _ctx, user) => {
  const meetings = await prisma.meeting.findMany({
    where: {
      OR: [
        { hostId: user.id },
        { participants: { some: { userId: user.id } } },
        { invitations: { some: { inviteeId: user.id } } },
      ],
    },
    orderBy: { createdAt: 'desc' },
    include: {
      host: { select: { id: true, displayName: true, avatarUrl: true } },
      _count: { select: { participants: true } },
    },
  });
  return json({ meetings });
});

const createSchema = z.object({
  title: z.string().min(1).max(120),
  description: z.string().max(2000).optional(),
  scheduledAt: z.coerce.date().optional(),
  visibility: z.enum(['PRIVATE', 'GROUP', 'PUBLIC']).default('PRIVATE'),
  groupId: z.string().optional(),
  externalUrl: z.string().url().max(500).optional(), // optional external fallback (e.g. Google Meet)
  inviteeIds: z.array(z.string()).default([]),
});

export const POST = withApi(async (req, _ctx, user) => {
  const body = await parseBody(req, createSchema);
  if (body.visibility === 'GROUP' && body.groupId) {
    const membership = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId: body.groupId, userId: user.id } },
    });
    if (!membership) return json({ error: 'FORBIDDEN', message: 'You are not a member of this group' }, 403);
  }
  const meeting = await prisma.meeting.create({
    data: {
      hostId: user.id,
      title: body.title,
      description: body.description,
      scheduledAt: body.scheduledAt,
      visibility: body.visibility,
      groupId: body.groupId,
      externalUrl: body.externalUrl,
      roomName: `arjun-${nanoid(16)}`,
      participants: { create: { userId: user.id, role: 'OWNER' } },
      invitations: {
        create: body.inviteeIds.map((inviteeId) => ({ inviterId: user.id, inviteeId })),
      },
    },
    include: { host: { select: { id: true, displayName: true } } },
  });
  // notify invitees via messenger-style notification
  if (body.inviteeIds.length > 0) {
    const { createNotifications } = await import('@/lib/notifications/service');
    await createNotifications(
      body.inviteeIds.map((inviteeId) => ({
        userId: inviteeId,
        type: 'MEETING_INVITE' as const,
        title: 'Meeting invitation',
        body: `${user.displayName ?? 'A trader'} invited you to "${body.title}"`,
        data: { meetingId: meeting.id, roomName: meeting.roomName },
      })),
    );
  }
  return json({ meeting }, 201);
});
