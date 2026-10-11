import { NextResponse, type NextRequest } from 'next/server';
import { jwtVerify } from 'jose';
import { env } from './lib/env';

const secret = new TextEncoder().encode(env.AUTH_SECRET);

const PUBLIC_PREFIXES = [
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/verify-email',
  '/onboarding',
  '/s/',
  '/api/auth/',
  '/api/stats/public',
  '/api/files/',
  '/api/socket',
  '/api/mt5/ingest', // EA push endpoint — authenticated by bearer sync token, not session
];

const ADMIN_PREFIXES = ['/admin', '/api/admin'];

async function hasValidSession(req: NextRequest): Promise<{ role: string } | null> {
  const token = req.cookies.get('arjun_session')?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret, { algorithms: ['HS256'] });
    if (typeof payload.sub !== 'string') return null;
    return { role: String(payload.role ?? 'MEMBER') };
  } catch {
    return null;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isPublic =
    pathname === '/' ||
    PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));

  const session = await hasValidSession(req);

  // protected app area
  if (pathname.startsWith('/dashboard') || pathname.startsWith('/terminal') || pathname.startsWith('/watchlist') || pathname.startsWith('/journal') || pathname.startsWith('/analytics') || pathname.startsWith('/calendar') || pathname.startsWith('/messages') || pathname.startsWith('/community') || pathname.startsWith('/charts') || pathname.startsWith('/mt5') || pathname.startsWith('/meetings') || pathname.startsWith('/notifications') || pathname.startsWith('/settings') || pathname.startsWith('/profiles')) {
    if (!session) {
      const url = req.nextUrl.clone();
      url.pathname = '/login';
      url.searchParams.set('next', pathname);
      return NextResponse.redirect(url);
    }
  }

  // admin area — API paths get JSON errors (the API layer also enforces roles);
  // page paths get redirects.
  for (const prefix of ADMIN_PREFIXES) {
    if (pathname.startsWith(prefix)) {
      const isApi = pathname.startsWith('/api/');
      const apiError = (status: number, code: string, message: string) =>
        new NextResponse(JSON.stringify({ error: code, message }), {
          status,
          headers: { 'content-type': 'application/json' },
        });
      if (!session) {
        if (isApi) return apiError(401, 'UNAUTHORIZED', 'Authentication required');
        const url = req.nextUrl.clone();
        url.pathname = '/login';
        return NextResponse.redirect(url);
      }
      if (session.role !== 'ADMIN') {
        if (isApi) return apiError(403, 'FORBIDDEN', 'Administrator access required');
        const url = req.nextUrl.clone();
        url.pathname = '/dashboard';
        url.searchParams.set('error', 'admin_required');
        return NextResponse.redirect(url);
      }
    }
  }

  // auth pages redirect to dashboard when already signed in
  if (!isPublic && session && ['/login', '/register'].includes(pathname)) {
    const url = req.nextUrl.clone();
    url.pathname = '/dashboard';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|fonts|uploads).*)'],
};
