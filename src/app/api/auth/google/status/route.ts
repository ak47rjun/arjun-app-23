import { json } from '@/lib/api';
import { isGoogleConfigured } from '@/lib/auth/google';

export const dynamic = 'force-dynamic';

/** Is Google sign-in configured on this server? Drives the login-page button. */
export async function GET(): Promise<Response> {
  return json({ configured: isGoogleConfigured() });
}
