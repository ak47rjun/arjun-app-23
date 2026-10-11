import { destroySession } from '@/lib/auth/session';
import { serializeClearSessionCookie } from '@/lib/auth/cookies';
import { audit } from '@/lib/audit';
import { json, withApi } from '@/lib/api';

export const dynamic = 'force-dynamic'; // API routes read cookies/headers — never prerender

export const POST = withApi(async (req, _ctx, user) => {
  await destroySession(req);
  await audit(user.id, 'LOGOUT');
  return json({ ok: true }, 200, { 'set-cookie': serializeClearSessionCookie() });
});
