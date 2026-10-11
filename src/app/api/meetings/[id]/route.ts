import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { forbidden, json, notFound, parseBody, withApi } from '@/lib/api';

export const dynamic = 'force-dynamic'; // API routes read cookies/headers — never prerender

async function getAccessibleMeeting(id: string, userId: string) {
  const meeting = await prisma.meeting.findUnique({
    where: { id },
    include: {
      participants: true,
      invitations: { where: { inviteeId: userId } },
      // The room page renders `meeting.host.displayName`, and MeetingInfo
      // declares `host` as required. Without this the page crashed with
      // "Cannot read properties of undefined (reading 'displayName')" —
      // i.e. EVERY meeting room was unusable.
      host: { select: { id: true, displayName: true, avatarUrl: true } },
    },
  });
  if (!meeting) throw notFound('Meeting not found');
  const isParticipant = meeting.participants.some((p) => p.userId === userId);
  const isInvited = meeting.invitations.length > 0;
  const isHost = meeting.hostId === userId;
  const canSee =
    isHost ||
    isParticipant ||
    isInvited ||
    meeting.visibility === 'PUBLIC' ||
    (meeting.visibility === 'GROUP' && meeting.groupId
      ? Boolean(
          await prisma.groupMember.findUnique({
            where: { groupId_userId: { groupId: meeting.groupId, userId } },
          }),
        )
      : false);
  if (!canSee) throw forbidden('You do not have access to this meeting');
  return { meeting, isHost };
}

export const GET = withApi(async (_req, ctx, user) => {
  const { meeting } = await getAccessibleMeeting(ctx.params.id, user.id);
  const participants = await prisma.meetingParticipant.findMany({
    where: { meetingId: meeting.id },
    include: { user: { select: { id: true, displayName: true, avatarUrl: true } } },
  });
  return json({ meeting, participants });
});

const patchSchema = z.object({
  title: z.string().min(1).max(120).optional(),
  description: z.string().max(2000).nullable().optional(),
  scheduledAt: z.coerce.date().nullable().optional(),
  status: z.enum(['SCHEDULED', 'LIVE', 'ENDED', 'CANCELLED']).optional(),
  externalUrl: z.string().url().max(500).nullable().optional(),
});

export const PATCH = withApi(async (req, ctx, user) => {
  const { meeting, isHost } = await getAccessibleMeeting(ctx.params.id, user.id);
  if (!isHost && user.role !== 'ADMIN') throw forbidden('Only the host can update this meeting');
  const body = await parseBody(req, patchSchema);
  const data: Record<string, unknown> = { ...body };
  if (body.status === 'LIVE' && !meeting.startedAt) data.startedAt = new Date();
  if (body.status === 'ENDED') data.endedAt = new Date();
  const updated = await prisma.meeting.update({ where: { id: meeting.id }, data });
  return json({ meeting: updated });
});

export const DELETE = withApi(async (_req, ctx, user) => {
  const { meeting, isHost } = await getAccessibleMeeting(ctx.params.id, user.id);
  if (!isHost && user.role !== 'ADMIN') throw forbidden('Only the host can cancel this meeting');
  await prisma.meeting.update({ where: { id: meeting.id }, data: { status: 'CANCELLED' } });
  return json({ cancelled: true });
});
