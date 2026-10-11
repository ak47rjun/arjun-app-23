import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { audit } from '@/lib/audit';
import { json, notFound, parseBody, withApi } from '@/lib/api';
import { destroyAllSessions } from '@/lib/auth/session';

export const dynamic = 'force-dynamic'; // API routes read cookies/headers — never prerender

const patchSchema = z.object({
  status: z.enum(['PENDING', 'REVIEWED', 'DISMISSED', 'ACTIONED']),
  action: z.enum(['WARN', 'BAN', 'UNBAN', 'DELETE_CONTENT', 'NONE']).optional(),
  targetUserId: z.string().optional(),
  note: z.string().max(1000).optional(),
});

export const PATCH = withApi(
  async (req, ctx, user) => {
    const report = await prisma.report.findUnique({ where: { id: ctx.params.id } });
    if (!report) throw notFound('Report not found');
    const body = await parseBody(req, patchSchema);

    if (body.action && body.action !== 'NONE' && body.targetUserId) {
      if (body.action === 'BAN') {
        await prisma.user.update({ where: { id: body.targetUserId }, data: { isBanned: true } });
        await destroyAllSessions(body.targetUserId);
      }
      if (body.action === 'UNBAN') {
        await prisma.user.update({ where: { id: body.targetUserId }, data: { isBanned: false } });
      }
      if (body.action === 'DELETE_CONTENT') {
        if (report.targetType === 'POST') {
          await prisma.post.updateMany({ where: { id: report.targetId }, data: { deletedAt: new Date() } });
        }
        if (report.targetType === 'MESSAGE') {
          await prisma.message.updateMany({
            where: { id: report.targetId },
            data: { deletedAt: new Date(), content: null },
          });
        }
        if (report.targetType === 'COMMENT') {
          await prisma.comment.updateMany({ where: { id: report.targetId }, data: { deletedAt: new Date() } });
        }
      }
      await prisma.moderationAction.create({
        data: {
          moderatorId: user.id,
          action: body.action,
          targetUserId: body.targetUserId,
          details: { reportId: report.id, note: body.note ?? null },
        },
      });
      await audit(user.id, `MODERATION_${body.action}`, {
        entity: 'Report',
        entityId: report.id,
        metadata: { targetUserId: body.targetUserId, note: body.note },
      });
    }

    const updated = await prisma.report.update({
      where: { id: report.id },
      data: {
        status: body.status,
        resolvedById: user.id,
        resolvedAt: new Date(),
      },
    });
    return json({ report: updated });
  },
  { roles: ['MODERATOR', 'ADMIN'] },
);
