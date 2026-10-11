import { prisma } from './prisma';
import type { Prisma } from '@prisma/client';

/** Append-only audit trail for security-sensitive operations. Fire-and-forget. */
export async function audit(
  actorId: string | null,
  action: string,
  opts: { entity?: string; entityId?: string; metadata?: Record<string, unknown>; ip?: string } = {},
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: actorId ?? undefined,
        action,
        entity: opts.entity,
        entityId: opts.entityId,
        metadata: (opts.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
        ip: opts.ip,
      },
    });
  } catch (e) {
    console.error('[audit] failed to write audit log', e);
  }
}
