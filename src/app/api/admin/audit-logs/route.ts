import { prisma } from '@/lib/prisma';
import { json, withApi } from '@/lib/api';

export const dynamic = 'force-dynamic'; // API routes read cookies/headers — never prerender

export const GET = withApi(
  async (req, _ctx, user) => {
    const url = new URL(req.url);
    const limit = Math.min(Number(url.searchParams.get('limit') ?? 100), 500);
    const action = url.searchParams.get('action');
    const logs = await prisma.auditLog.findMany({
      where: action ? { action } : {},
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { actor: { select: { id: true, displayName: true, email: true } } },
    });
    return json({ logs });
  },
  { roles: ['ADMIN'] },
);
