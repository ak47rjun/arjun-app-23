import { prisma } from '@/lib/prisma';
import { getStorage, randomStorageKey } from '@/lib/storage';
import { badRequest, json, withApi } from '@/lib/api';

export const dynamic = 'force-dynamic'; // API routes read cookies/headers — never prerender

const ALLOWED: Record<string, string[]> = {
  avatar: ['image/png', 'image/jpeg', 'image/webp'],
  attachment: ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf', 'video/mp4', 'video/webm'],
  chart: ['image/png', 'image/jpeg', 'image/webp'],
};

const MAX_BYTES: Record<string, number> = {
  avatar: 5 * 1024 * 1024,
  attachment: 25 * 1024 * 1024,
  chart: 10 * 1024 * 1024,
};

/** Upload a file (avatar / message attachment / chart snapshot). */
export const POST = withApi(async (req, _ctx, user) => {
  const form = await req.formData();
  const file = form.get('file');
  const kind = String(form.get('kind') ?? 'attachment');
  if (!(file instanceof File)) throw badRequest('file is required');
  if (!ALLOWED[kind]) throw badRequest('Invalid kind');
  if (!ALLOWED[kind].includes(file.type)) throw badRequest(`Unsupported file type: ${file.type}`);
  if (file.size > MAX_BYTES[kind]) throw badRequest('File too large');

  const ext = file.name.includes('.') ? `.${file.name.split('.').pop()!.slice(0, 5)}` : '';
  const key = randomStorageKey(kind, ext || '.bin');
  const buffer = Buffer.from(await file.arrayBuffer());
  const stored = await getStorage().put(key, buffer, file.type);

  const attachment = await prisma.attachment.create({
    data: {
      uploaderId: user.id,
      storageKey: key,
      url: stored.url,
      filename: file.name || 'upload',
      mimeType: file.type,
      size: file.size,
      kind,
    },
  });

  // avatars update the profile immediately
  if (kind === 'avatar') {
    await prisma.user.update({ where: { id: user.id }, data: { avatarUrl: stored.url } });
  }

  return json({ attachment: { ...attachment, url: stored.url } }, 201);
});
