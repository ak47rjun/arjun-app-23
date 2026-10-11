import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { json, parseBody, withApi } from '@/lib/api';

export const dynamic = 'force-dynamic'; // API routes read cookies/headers — never prerender

/** List public groups + groups I belong to. */
export const GET = withApi(async (req, _ctx, user) => {
  const url = new URL(req.url);
  const q = url.searchParams.get('q')?.trim();
  const memberships = await prisma.groupMember.findMany({
    where: { userId: user.id },
    select: { groupId: true },
  });
  const groups = await prisma.group.findMany({
    where: {
      OR: [{ visibility: 'PUBLIC' }, { id: { in: memberships.map((m) => m.groupId) } }],
      ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { description: { contains: q, mode: 'insensitive' } }] } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: {
      owner: { select: { id: true, displayName: true, avatarUrl: true } },
      _count: { select: { members: true, posts: true } },
    },
  });
  const myGroupIds = new Set(memberships.map((m) => m.groupId));
  return json({ groups: groups.map((g) => ({ ...g, isMember: myGroupIds.has(g.id) })) });
});

const createSchema = z.object({
  name: z.string().min(2).max(80),
  description: z.string().max(1000).optional(),
  visibility: z.enum(['PUBLIC', 'PRIVATE']).default('PUBLIC'),
});

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'group'
  );
}

export const POST = withApi(async (req, _ctx, user) => {
  const body = await parseBody(req, createSchema);
  const baseSlug = slugify(body.name);
  let slug = baseSlug;
  let n = 0;
  while (await prisma.group.findUnique({ where: { slug } })) {
    n += 1;
    slug = `${baseSlug}-${n}`;
  }
  const group = await prisma.group.create({
    data: {
      name: body.name,
      slug,
      description: body.description,
      visibility: body.visibility,
      ownerId: user.id,
      members: { create: { userId: user.id, role: 'OWNER' } },
      conversation: { create: { type: 'GROUP', createdById: user.id, members: { create: { userId: user.id, role: 'OWNER' } } } },
    },
    include: { _count: { select: { members: true } } },
  });
  return json({ group }, 201);
});
