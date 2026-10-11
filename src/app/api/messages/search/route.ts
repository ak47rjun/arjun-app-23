import { json, withApi } from '@/lib/api';
import { searchMessages } from '@/lib/messenger/service';

export const dynamic = 'force-dynamic'; // API routes read cookies/headers — never prerender

export const GET = withApi(async (req, _ctx, user) => {
  const q = new URL(req.url).searchParams.get('q') ?? '';
  const messages = await searchMessages(user.id, q);
  return json({ messages });
});
