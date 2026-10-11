import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { badRequest, json, parseBody, withApi } from '@/lib/api';

export const dynamic = 'force-dynamic'; // API routes read cookies/headers — never prerender

export const PATCH = withApi(async (req, _ctx, user) => {
  const schema = z.object({
    displayName: z.string().min(2).max(50).optional(),
    name: z.string().max(80).optional(),
    bio: z.string().max(500).optional(),
    timezone: z.string().max(64).optional(),
    avatarUrl: z.string().max(500).optional(),
    profile: z
      .object({
        experienceYears: z.number().int().min(0).max(80).optional(),
        preferredMarkets: z.array(z.string()).optional(),
        country: z.string().max(64).optional(),
        isPublic: z.boolean().optional(),
        showStats: z.boolean().optional(),
        onboardingDone: z.boolean().optional(),
        socialLinks: z.record(z.string()).optional(),
      })
      .optional(),
    settings: z
      .object({
        theme: z.string().optional(),
        density: z.string().optional(),
        timezone: z.string().optional(),
        dashboardLayout: z.any().optional(),
        privacy: z.record(z.boolean()).optional(),
      })
      .optional(),
  });
  const body = await parseBody(req, schema);

  const { profile, settings, ...userFields } = body;
  if (Object.keys(userFields).length > 0) {
    await prisma.user.update({ where: { id: user.id }, data: userFields });
  }
  if (profile) {
    await prisma.profile.upsert({
      where: { userId: user.id },
      create: { userId: user.id, ...profile },
      update: profile,
    });
  }
  if (settings) {
    await prisma.userSettings.upsert({
      where: { userId: user.id },
      create: { userId: user.id, ...settings },
      update: settings,
    });
  }
  return json({ updated: true });
});
