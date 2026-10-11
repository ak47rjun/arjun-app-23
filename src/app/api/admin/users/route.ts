import { prisma } from '@/lib/prisma';
import { json, withApi } from '@/lib/api';

export const dynamic = 'force-dynamic'; // API routes read cookies/headers — never prerender

/** Admin: list/search users. */
export const GET = withApi(
  async (req, _ctx, user) => {
    const url = new URL(req.url);
    const q = url.searchParams.get('q')?.trim() ?? '';
    const role = url.searchParams.get('role');
    const users = await prisma.user.findMany({
      where: {
        ...(q
          ? { OR: [{ email: { contains: q, mode: 'insensitive' } }, { displayName: { contains: q, mode: 'insensitive' } }] }
          : {}),
        ...(role ? { role: role as never } : {}),
      },
      select: {
        id: true,
        email: true,
        displayName: true,
        avatarUrl: true,
        role: true,
        isBanned: true,
        emailVerified: true,
        createdAt: true,
        lastLoginAt: true,
        _count: { select: { trades: true, posts: true, messages: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return json({ users });
  },
  { roles: ['ADMIN'] },
);
