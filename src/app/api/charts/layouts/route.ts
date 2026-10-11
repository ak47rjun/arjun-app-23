import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { json, parseBody, withApi } from '@/lib/api';

export const dynamic = 'force-dynamic'; // API routes read cookies/headers — never prerender

/** Saved chart layouts (private per user). */
export const GET = withApi(async (_req, _ctx, user) => {
  const layouts = await prisma.chartLayout.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: 'desc' },
  });
  return json({ layouts });
});

const schema = z.object({
  name: z.string().min(1).max(80),
  symbol: z.string().min(1).max(20),
  timeframe: z.string().max(10).default('60'),
  config: z.any().default({}),
  isDefault: z.boolean().default(false),
});

export const POST = withApi(async (req, _ctx, user) => {
  const body = await parseBody(req, schema);
  const instrument = await prisma.instrument.findUnique({ where: { symbol: body.symbol.toUpperCase() } });
  if (body.isDefault) {
    await prisma.chartLayout.updateMany({ where: { userId: user.id }, data: { isDefault: false } });
  }
  const layout = await prisma.chartLayout.create({
    data: {
      userId: user.id,
      instrumentId: instrument?.id,
      name: body.name,
      symbol: body.symbol.toUpperCase(),
      timeframe: body.timeframe,
      config: body.config,
      isDefault: body.isDefault,
    },
  });
  return json({ layout }, 201);
});
