import { prisma } from '@/lib/prisma';
import { json } from '@/lib/api';

export const dynamic = 'force-dynamic'; // API routes read cookies/headers — never prerender

/** Public, aggregate platform stats for the landing page (no user data). */
export async function GET(): Promise<Response> {
  const [members, trades, posts, groups] = await Promise.all([
    prisma.user.count({ where: { isBanned: false } }),
    prisma.trade.count({ where: { source: 'MANUAL' } }),
    prisma.post.count({ where: { deletedAt: null } }),
    prisma.group.count({ where: { visibility: 'PUBLIC' } }),
  ]);
  return json({ members, tradesJournaled: trades, posts, publicGroups: groups });
}
