import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getStorage, randomStorageKey } from '@/lib/storage';
import { badRequest, forbidden, json, notFound, withApi } from '@/lib/api';

export const dynamic = 'force-dynamic'; // API routes read cookies/headers — never prerender

const ALLOWED = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const MAX_BYTES = 10 * 1024 * 1024;

/** Attach an uploaded screenshot (before/after entry) to a journal trade. */
export const POST = withApi(async (req, ctx, user) => {
  const trade = await prisma.trade.findUnique({ where: { id: ctx.params.id } });
  if (!trade) throw notFound('Trade not found');
  if (trade.userId !== user.id) throw forbidden('This trade belongs to another user');

  const form = await req.formData();
  const file = form.get('file');
  const kind = String(form.get('kind') ?? 'AFTER');
  if (!(file instanceof File)) throw badRequest('file is required');
  if (!ALLOWED.has(file.type)) throw badRequest('Only PNG/JPEG/WebP/GIF images are allowed');
  if (file.size > MAX_BYTES) throw badRequest('File too large (max 10 MB)');

  const ext = file.type === 'image/png' ? '.png' : file.type === 'image/jpeg' ? '.jpg' : file.type === 'image/webp' ? '.webp' : '.gif';
  const key = randomStorageKey('journal', ext);
  const buffer = Buffer.from(await file.arrayBuffer());
  const storage = getStorage();
  const stored = await storage.put(key, buffer, file.type);

  const screenshot = await prisma.tradeScreenshot.create({
    data: {
      tradeId: trade.id,
      url: stored.url,
      kind: kind === 'BEFORE' ? 'BEFORE' : 'AFTER',
      caption: String(form.get('caption') ?? '') || null,
    },
  });

  // also register as an attachment so the access-controlled file route can serve it
  await prisma.attachment.create({
    data: {
      uploaderId: user.id,
      storageKey: key,
      url: stored.url,
      filename: file.name || `screenshot${ext}`,
      mimeType: file.type,
      size: file.size,
      kind: 'chart',
    },
  });

  return json({ screenshot }, 201);
});

export const GET = withApi(async (_req, ctx, user) => {
  const trade = await prisma.trade.findUnique({
    where: { id: ctx.params.id },
    include: { screenshots: true },
  });
  if (!trade) throw notFound('Trade not found');
  if (trade.userId !== user.id) throw forbidden('This trade belongs to another user');
  return json({ screenshots: trade.screenshots });
});
