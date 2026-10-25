import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

/**
 * `/api/cron` is public here because it authenticates itself with the OPPORTUNITY_CRON_SECRET
 * bearer token: a scheduler sends that header and no session cookie, so gating it on a session
 * would make the route unreachable and its own secret check dead code.
 */
const PUBLIC_PATHS = ['/login', '/signup', '/auth', '/dev/theme', '/api/dev', '/api/health', '/api/cron'];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

/** Refreshes the Supabase session on every request and sends signed-out users to /login. */
export async function middleware(request: NextRequest) {
  const { response, user } = await updateSession(request);
  const { pathname, search } = request.nextUrl;
  if (!user && !isPublic(pathname) && pathname !== '/') {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { ok: false, error: { code: 'UNAUTHENTICATED', message: 'Sign in to continue' } },
        { status: 401 },
      );
    }
    const login = new URL('/login', request.url);
    login.searchParams.set('next', `${pathname}${search}`);
    return NextResponse.redirect(login);
  }
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};
