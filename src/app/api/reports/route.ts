import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { json, parseBody, withApi } from '@/lib/api';

export const dynamic = 'force-dynamic'; // API routes read cookies/headers — never prerender

/** File a report (user, post, message, comment, group). */
const schema = z.object({
  targetType: z.enum(['USER', 'POST', 'MESSAGE', 'COMMENT', 'GROUP']),
  targetId: z.string().min(1),
  reason: z.string().min(3).max(1000),
});

export const POST = withApi(async (req, _ctx, user) => {
  const body = await parseBody(req, schema);
  const report = await prisma.report.create({
    data: {
      reporterId: user.id,
      targetType: body.targetType,
      targetId: body.targetId,
      reason: body.reason,
    },
  });
  // notify moderators
  const moderators = await prisma.user.findMany({
    where: { role: { in: ['MODERATOR', 'ADMIN'] } },
    select: { id: true },
  });
  const { createNotifications } = await import('@/lib/notifications/service');
  await createNotifications(
    moderators.map((m) => ({
      userId: m.id,
      type: 'REPORT' as const,
      title: 'New report submitted',
      body: `${body.targetType} reported: ${body.reason.slice(0, 120)}`,
      data: { reportId: report.id },
    })),
  );
  return json({ report }, 201);
});
