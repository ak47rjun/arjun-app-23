import { prisma } from '@/lib/prisma';
import { json, withApi } from '@/lib/api';

export const dynamic = 'force-dynamic'; // API routes read cookies/headers — never prerender

/** Admin/moderator: moderation queue. */
export const GET = withApi(
  async (req, _ctx, user) => {
    const url = new URL(req.url);
    const status = url.searchParams.get('status') ?? 'PENDING';
    const reports = await prisma.report.findMany({
      where: { status: status as never },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        reporter: { select: { id: true, displayName: true, avatarUrl: true } },
        resolvedBy: { select: { id: true, displayName: true } },
      },
    });
    const counts = await prisma.report.groupBy({
      by: ['status'],
      _count: true,
    });
    return json({ reports, counts });
  },
  { roles: ['MODERATOR', 'ADMIN'] },
);
