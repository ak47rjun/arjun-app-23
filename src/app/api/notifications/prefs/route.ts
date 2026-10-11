import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { json, parseBody, withApi } from '@/lib/api';

export const dynamic = 'force-dynamic'; // API routes read cookies/headers — never prerender

export const GET = withApi(async (_req, _ctx, user) => {
  const prefs = await prisma.notificationPrefs.upsert({
    where: { userId: user.id },
    create: { userId: user.id },
    update: {},
  });
  return json({ prefs });
});

const patchSchema = z.object({
  inApp: z.record(z.boolean()).optional(),
  email: z.record(z.boolean()).optional(),
  push: z.record(z.boolean()).optional(),
});

export const PATCH = withApi(async (req, _ctx, user) => {
  const body = await parseBody(req, patchSchema);
  const prefs = await prisma.notificationPrefs.upsert({
    where: { userId: user.id },
    create: { userId: user.id, ...body },
    update: body,
  });
  return json({ prefs });
});
