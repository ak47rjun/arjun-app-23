import { isGoogleConfigured, buildGoogleAuthUrl } from '@/lib/auth/google';
import { appUrl, env } from '@/lib/env';

export const dynamic = 'force-dynamic'; // API routes read cookies/headers — never prerender

/** Start Google OAuth: redirect to Google with state + nonce + PKCE cookies set. */
export async function GET(): Promise<Response> {
  if (!isGoogleConfigured()) {
    return Response.redirect(appUrl('/login?error=google_not_configured'), 302);
  }
  const { url, cookies } = buildGoogleAuthUrl(appUrl('/api/auth/google/callback'));
  return new Response(null, {
    status: 302,
    headers: {
      location: url,
      'set-cookie': cookies.join(', '),
      // guard against the OAuth redirect being framed
      'x-frame-options': 'DENY',
      ...(env.NODE_ENV === 'production' ? { 'strict-transport-security': 'max-age=63072000' } : {}),
    },
  });
}
