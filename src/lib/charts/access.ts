/** Server-side access control for shared charts. */
import { prisma } from '../prisma';
import type { ChartShare } from '@prisma/client';

export async function canViewShare(share: Pick<ChartShare, 'id' | 'ownerId' | 'visibility' | 'groupId' | 'linkToken'>, userId: string | null): Promise<boolean> {
  if (share.ownerId === userId) return true;
  switch (share.visibility) {
    case 'PUBLIC':
      return true;
    case 'PRIVATE':
      // private shares are only accessible via the unguessable link token —
      // enforced at the /s/[token] route; by id they are owner-only.
      return false;
    case 'GROUP': {
      if (!userId || !share.groupId) return false;
      const membership = await prisma.groupMember.findUnique({
        where: { groupId_userId: { groupId: share.groupId, userId } },
      });
      return Boolean(membership);
    }
    default:
      return false;
  }
}

/** Look up a share by its public link token (PRIVATE or PUBLIC shares). */
export async function getShareByToken(token: string) {
  return prisma.chartShare.findUnique({
    where: { linkToken: token },
    include: {
      owner: { select: { id: true, displayName: true, avatarUrl: true, profile: { select: { verifiedBadge: true } } } },
      snapshot: true,
      group: { select: { id: true, name: true } },
    },
  });
}
