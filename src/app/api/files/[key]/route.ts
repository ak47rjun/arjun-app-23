import { prisma } from '@/lib/prisma';
import { getStorage } from '@/lib/storage';
import { getSessionUser } from '@/lib/auth/session';

export const dynamic = 'force-dynamic'; // API routes read cookies/headers — never prerender

/**
 * Access-controlled file serving. Private attachments are only served to the
 * uploader and members of conversations/posts that reference them. Avatars are
 * public. Nothing is served without validation.
 */
export async function GET(req: Request, ctx: { params: { key: string } }): Promise<Response> {
  const key = decodeURIComponent(ctx.params.key);
  const storage = getStorage();

  // Authorize BEFORE touching the disk. Reading first meant a missing file
  // returned 404 while a present-but-forbidden one returned 403, which turned
  // this endpoint into an existence oracle for arbitrary storage keys.
  const attachment = await prisma.attachment.findUnique({ where: { storageKey: key } });
  const user = await getSessionUser(req);

  let mime = attachment?.mimeType ?? 'application/octet-stream';
  let isPublic = false;

  if (attachment) {
    if (attachment.kind === 'avatar') {
      isPublic = true;
    } else if (user) {
      if (attachment.uploaderId === user.id) {
        isPublic = true;
      } else {
        // conversation member?
        const viaMessage = await prisma.message.findFirst({
          where: {
            attachmentId: attachment.id,
            conversation: { members: { some: { userId: user.id } } },
          },
        });
        if (viaMessage) isPublic = true;
        // public post media?
        if (!isPublic) {
          const viaPost = await prisma.post.findFirst({
            where: { mediaUrls: { has: attachment.url }, deletedAt: null, visibility: 'PUBLIC' },
          });
          if (viaPost) isPublic = true;
        }
        // shared chart snapshots (public shares)
        if (!isPublic) {
          const viaSnapshot = await prisma.chartSnapshot.findFirst({
            where: { imageUrl: attachment.url, shares: { some: { visibility: { in: ['PUBLIC', 'GROUP'] } } } },
          });
          if (viaSnapshot) {
            // GROUP shares still require membership — keep private unless PUBLIC
            const share = await prisma.chartShare.findFirst({
              where: { snapshot: { imageUrl: attachment.url }, visibility: 'PUBLIC' },
            });
            if (share) isPublic = true;
          }
        }
      }
    }
  } else {
    // unknown key — treat as private
    isPublic = false;
  }

  if (!isPublic) return new Response('Forbidden', { status: 403 });

  const buffer = await storage.get(key);
  if (!buffer) return new Response('Not found', { status: 404 });

  const headers: Record<string, string> = {
    'content-type': mime,
    'x-content-type-options': 'nosniff',
    'cache-control': 'private, max-age=3600',
  };
  if (mime.startsWith('image/')) headers['cache-control'] = 'public, max-age=86400';
  return new Response(new Uint8Array(buffer), { headers });
}
