import { prisma } from '@/lib/prisma';
import { forbidden, json, notFound, withApi } from '@/lib/api';

export const dynamic = 'force-dynamic'; // API routes read cookies/headers — never prerender

export const POST = withApi(async (_req, ctx, user) => {
  const meeting = await prisma.meeting.findUnique({ where: { id: ctx.params.id } });
  if (!meeting) throw notFound('Meeting not found');
  if (meeting.hostId !== user.id && user.role !== 'ADMIN') throw forbidden('Only the host can end this meeting');
  const updated = await prisma.meeting.update({
    where: { id: meeting.id },
    data: { status: 'ENDED', endedAt: new Date() },
  });
  return json({ meeting: updated });
});
