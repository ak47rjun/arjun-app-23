import { prisma } from '@/lib/prisma';
import { forbidden, json, notFound, withApi } from '@/lib/api';
import { issueMeetingToken, meetConfigured, missingMeetConfig } from '@/lib/meet/livekit';

export const dynamic = 'force-dynamic'; // API routes read cookies/headers — never prerender

/** Join a meeting: returns a LiveKit access token. Setup-required state if unconfigured. */
export const POST = withApi(async (_req, ctx, user) => {
  const meeting = await prisma.meeting.findUnique({
    where: { id: ctx.params.id },
    include: {
      participants: true,
      invitations: { where: { inviteeId: user.id } },
    },
  });
  if (!meeting) throw notFound('Meeting not found');
  if (meeting.status === 'CANCELLED') return json({ error: 'CANCELLED', message: 'This meeting was cancelled' }, 410);
  if (meeting.status === 'ENDED') return json({ error: 'ENDED', message: 'This meeting has ended' }, 410);

  const isParticipant = meeting.participants.some((p) => p.userId === user.id);
  const isInvited = meeting.invitations.length > 0;
  const isHost = meeting.hostId === user.id;
  const groupOk =
    meeting.visibility !== 'GROUP' ||
    !meeting.groupId ||
    Boolean(
      await prisma.groupMember.findUnique({
        where: { groupId_userId: { groupId: meeting.groupId, userId: user.id } },
      }),
    );
  const allowed = isHost || isParticipant || isInvited || meeting.visibility === 'PUBLIC' || groupOk;
  if (!allowed) throw forbidden('You do not have access to this meeting');

  if (!meetConfigured()) {
    // Honest setup-required state: no fake "joined" response.
    return json(
      {
        error: 'SETUP_REQUIRED',
        message: `ARJUN Meet is not fully configured — still missing ${missingMeetConfig().join(', ')}. Set LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET (see docs/MEETINGS.md). The host may provide an external meeting link as a fallback.`,
        externalUrl: meeting.externalUrl,
      },
      503,
    );
  }

  const token = await issueMeetingToken({
    roomName: meeting.roomName,
    identity: user.id,
    name: user.displayName ?? user.email,
    isHost,
  });

  // record participation + mark live
  await prisma.meetingParticipant.upsert({
    where: { meetingId_userId: { meetingId: meeting.id, userId: user.id } },
    create: { meetingId: meeting.id, userId: user.id, role: isHost ? 'OWNER' : 'MEMBER', joinedAt: new Date() },
    update: { joinedAt: new Date(), leftAt: null },
  });
  if (meeting.status === 'SCHEDULED') {
    await prisma.meeting.update({
      where: { id: meeting.id },
      data: { status: 'LIVE', startedAt: meeting.startedAt ?? new Date() },
    });
  }

  return json({ token: token.token, url: token.url, roomName: token.roomName, meetingId: meeting.id });
});
