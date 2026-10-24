import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { log } from '@/lib/log';
import { safeNext } from '@/lib/safe-next';

/** Public route: exchanges the magic-link / email-confirmation code for a session. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const target = safeNext(url.searchParams.get('next'));
  if (code) {
    const supabase = await createServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(target, url.origin));
    log.warn('auth.callback_failed', { code: error.code });
  }
  return NextResponse.redirect(new URL('/login?error=link', url.origin));
}
