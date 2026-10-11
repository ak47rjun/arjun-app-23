import { prisma } from '@/lib/prisma';
import { audit } from '@/lib/audit';
import { withApi } from '@/lib/api';

export const dynamic = 'force-dynamic'; // API routes read cookies/headers — never prerender

/** GDPR-style personal data export: everything ARJUN stores about the user. */
export const GET = withApi(async (_req, _ctx, user) => {
  const [
    dbUser,
    profile,
    settings,
    trades,
    accounts,
    mt5,
    watchlists,
    messages,
    posts,
    comments,
    groups,
    meetings,
    notifications,
    sessions,
  ] = await Promise.all([
    prisma.user.findUnique({ where: { id: user.id } }),
    prisma.profile.findUnique({ where: { userId: user.id } }),
    prisma.userSettings.findUnique({ where: { userId: user.id } }),
    prisma.trade.findMany({ where: { userId: user.id }, include: { tags: true, screenshots: true } }),
    prisma.tradingAccount.findMany({ where: { userId: user.id } }),
    prisma.mt5Connection.findMany({ where: { userId: user.id }, select: { id: true, login: true, server: true, status: true, createdAt: true } }),
    prisma.watchlist.findMany({ where: { userId: user.id }, include: { items: true } }),
    prisma.message.findMany({ where: { senderId: user.id } }),
    prisma.post.findMany({ where: { authorId: user.id } }),
    prisma.comment.findMany({ where: { authorId: user.id } }),
    prisma.group.findMany({ where: { ownerId: user.id } }),
    prisma.meeting.findMany({ where: { hostId: user.id } }),
    prisma.notification.findMany({ where: { userId: user.id } }),
    prisma.session.findMany({ where: { userId: user.id } }),
  ]);

  await audit(user.id, 'DATA_EXPORT');

  // strip secrets before export
  const safeUser = dbUser
    ? {
        ...dbUser,
        passwordHash: '[redacted]',
        totpSecret: dbUser.totpSecret ? '[redacted]' : null,
      }
    : null;

  const payload = {
    exportedAt: new Date().toISOString(),
    user: safeUser,
    profile,
    settings,
    trades,
    tradingAccounts: accounts,
    mt5Connections: mt5,
    watchlists,
    messages,
    posts,
    comments,
    groups,
    meetings,
    notifications,
    sessions: sessions.map((s) => ({ id: s.id, createdAt: s.createdAt, expiresAt: s.expiresAt, userAgent: s.userAgent })),
  };

  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      'content-type': 'application/json',
      'content-disposition': `attachment; filename="arjun-data-export-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
});
