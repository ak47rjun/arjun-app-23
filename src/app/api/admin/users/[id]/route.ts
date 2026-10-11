import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { audit } from '@/lib/audit';
import { forbidden, json, notFound, parseBody, withApi } from '@/lib/api';
import { destroyAllSessions } from '@/lib/auth/session';

export const dynamic = 'force-dynamic'; // API routes read cookies/headers — never prerender

const patchSchema = z.object({
  role: z.enum(['GUEST', 'MEMBER', 'VERIFIED_TRADER', 'MODERATOR', 'ADMIN']).optional(),
  isBanned: z.boolean().optional(),
  verifiedBadge: z.boolean().optional(), // profile badge (verification workflow)
});

export const PATCH = withApi(
  async (req, ctx, user) => {
    const target = await prisma.user.findUnique({ where: { id: ctx.params.id } });
    if (!target) throw notFound('User not found');
    if (target.id === user.id) throw forbidden('You cannot change your own role');
    const body = await parseBody(req, patchSchema);

    if (body.role && body.role !== target.role) {
      await prisma.user.update({ where: { id: target.id }, data: { role: body.role } });
      await audit(user.id, 'ROLE_CHANGE', {
        entity: 'User',
        entityId: target.id,
        metadata: { from: target.role, to: body.role },
      });
    }
    if (body.isBanned !== undefined && body.isBanned !== target.isBanned) {
      await prisma.user.update({ where: { id: target.id }, data: { isBanned: body.isBanned } });
      if (body.isBanned) await destroyAllSessions(target.id);
      await audit(user.id, body.isBanned ? 'BAN_USER' : 'UNBAN_USER', { entity: 'User', entityId: target.id });
    }
    if (body.verifiedBadge !== undefined) {
      await prisma.profile.upsert({
        where: { userId: target.id },
        create: { userId: target.id, verifiedBadge: body.verifiedBadge },
        update: { verifiedBadge: body.verifiedBadge },
      });
      await prisma.moderationAction.create({
        data: {
          moderatorId: user.id,
          action: body.verifiedBadge ? 'VERIFY_TRADER' : 'UNVERIFY_TRADER',
          targetUserId: target.id,
        },
      });
      await audit(user.id, body.verifiedBadge ? 'VERIFY_TRADER' : 'UNVERIFY_TRADER', { entity: 'User', entityId: target.id });
    }
    const updated = await prisma.user.findUnique({
      where: { id: target.id },
      select: { id: true, email: true, role: true, isBanned: true, profile: { select: { verifiedBadge: true } } },
    });
    return json({ user: updated });
  },
  { roles: ['ADMIN'] },
);
