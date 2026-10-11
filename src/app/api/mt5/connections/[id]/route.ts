import { prisma } from '@/lib/prisma';
import { audit } from '@/lib/audit';
import { forbidden, json, notFound, withApi } from '@/lib/api';

export const dynamic = 'force-dynamic'; // API routes read cookies/headers — never prerender

/** Disconnect + revoke an MT5 connection (credentials are deleted). */
export const DELETE = withApi(async (_req, ctx, user) => {
  const connection = await prisma.mt5Connection.findUnique({ where: { id: ctx.params.id } });
  if (!connection) throw notFound('Connection not found');
  if (connection.userId !== user.id) throw forbidden('This connection belongs to another user');
  await prisma.mt5Connection.delete({ where: { id: connection.id } });
  await audit(user.id, 'MT5_DISCONNECT', { entity: 'Mt5Connection', entityId: connection.id });
  return json({ disconnected: true });
});
