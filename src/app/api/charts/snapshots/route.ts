import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getStorage, randomStorageKey } from '@/lib/storage';
import { badRequest, json, parseBody, withApi } from '@/lib/api';

export const dynamic = 'force-dynamic'; // API routes read cookies/headers — never prerender

/** Save a chart snapshot (image upload + optional drawings). */
const schema = z.object({
  symbol: z.string().min(1).max(20),
  timeframe: z.string().max(10).default('60'),
  note: z.string().max(2000).optional(),
  drawings: z.any().optional(),
});

export const POST = withApi(async (req, _ctx, user) => {
  // supports multipart (with image) or JSON (without image)
  const contentType = req.headers.get('content-type') ?? '';
  let symbol: string;
  let timeframe = '60';
  let note: string | undefined;
  let drawings: unknown;
  let imageUrl: string | null = null;

  if (contentType.includes('multipart/form-data')) {
    const form = await req.formData();
    symbol = String(form.get('symbol') ?? '').toUpperCase();
    timeframe = String(form.get('timeframe') ?? '60');
    note = String(form.get('note') ?? '') || undefined;
    const drawingsRaw = form.get('drawings');
    if (drawingsRaw) {
      try {
        drawings = JSON.parse(String(drawingsRaw));
      } catch {
        throw badRequest('drawings must be valid JSON');
      }
    }
    const file = form.get('image');
    if (file instanceof File && file.size > 0) {
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw badRequest('Only PNG/JPEG/WebP images');
      if (file.size > 10 * 1024 * 1024) throw badRequest('Image too large (max 10 MB)');
      const ext = file.type === 'image/png' ? '.png' : file.type === 'image/jpeg' ? '.jpg' : '.webp';
      const key = randomStorageKey('charts', ext);
      const stored = await getStorage().put(key, Buffer.from(await file.arrayBuffer()), file.type);
      imageUrl = stored.url;
      await prisma.attachment.create({
        data: {
          uploaderId: user.id,
          storageKey: key,
          url: stored.url,
          filename: file.name || `snapshot${ext}`,
          mimeType: file.type,
          size: file.size,
          kind: 'chart',
        },
      });
    }
  } else {
    const body = await parseBody(req, schema);
    symbol = body.symbol.toUpperCase();
    timeframe = body.timeframe;
    note = body.note;
    drawings = body.drawings;
  }

  if (!symbol) throw badRequest('symbol is required');
  const snapshot = await prisma.chartSnapshot.create({
    data: {
      userId: user.id,
      symbol,
      timeframe,
      note,
      imageUrl,
      drawings: drawings ?? undefined,
    },
  });
  return json({ snapshot }, 201);
});
