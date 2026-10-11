import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { forbidden, json, notFound, parseBody, withApi } from '@/lib/api';
import { createNotifications } from '@/lib/notifications/service';

export const dynamic = 'force-dynamic'; // API routes read cookies/headers — never prerender

const schema = z.object({ userIds: z.array(z.string()).min(1).max(50) });

export const POST = withApi(async (req, ctx, user) => {
  const body = await parseBody(req, schema);
  const meeting = await prisma.meeting.findUnique({
    where: { id: ctx.params.id },
    include: { participants: { where: { userId: user.id } } },
  });
  if (!meeting) throw notFound('Meeting not found');
  const isHost = meeting.hostId === user.id;
  const isAdmin = meeting.participants[0]?.role === 'ADMIN';
  if (!isHost && !isAdmin && user.role === 'MEMBER') throw forbidden('Only the host can invite participants');

  for (const inviteeId of body.userIds) {
    await prisma.meetingInvitation.upsert({
      where: { meetingId_inviteeId: { meetingId: meeting.id, inviteeId } },
      create: { meetingId: meeting.id, inviterId: user.id, inviteeId },
      update: {},
    });
  }
  await createNotifications(
    body.userIds.map((inviteeId) => ({
      userId: inviteeId,
      type: 'MEETING_INVITE' as const,
      title: 'Meeting invitation',
      body: `${user.displayName ?? 'A trader'} invited you to "${meeting.title}"`,
      data: { meetingId: meeting.id, roomName: meeting.roomName },
    })),
  );
  return json({ invited: body.userIds.length });
});
