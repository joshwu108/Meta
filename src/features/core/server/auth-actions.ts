'use server';
import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import { log } from '@/lib/log';
import { loginSchema, signupSchema } from '@/shared/schemas/profile';
import { zodIssues } from '@/lib/api/parse-body';

export type AuthFormState = { error?: string; fieldErrors?: Record<string, string>; message?: string };

function fieldErrors(issues: Array<{ path: string; message: string }>): Record<string, string> {
  return Object.fromEntries(issues.map((issue) => [issue.path, issue.message]));
}

function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? 'http://127.0.0.1:3000';
}

/** Email + password sign in. Redirects to `/` which routes by onboarding state. */
export async function signInAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = loginSchema.safeParse({ email: formData.get('email'), password: formData.get('password') });
  if (!parsed.success) return { fieldErrors: fieldErrors(zodIssues(parsed.error)) };
  const supabase = await createServerClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    log.warn('auth.sign_in_failed', { code: error.code });
    return { error: 'Email or password is incorrect' };
  }
  redirect((formData.get('next') as string | null) || '/');
}

/** Sign up with display name and adult confirmation. Businesses continue to business onboarding. */
export async function signUpAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = signupSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    display_name: formData.get('display_name'),
    is_adult_confirmed: formData.get('is_adult_confirmed') === 'on' ? true : undefined,
    as: formData.get('as') === 'business' ? 'business' : 'consumer',
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(zodIssues(parsed.error)) };
  const { email, password, display_name, as } = parsed.data;
  const supabase = await createServerClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { display_name, is_adult_confirmed: true, signup_as: as }, emailRedirectTo: `${siteUrl()}/auth/callback` },
  });
  if (error) {
    log.warn('auth.sign_up_failed', { code: error.code });
    return { error: error.message.includes('registered') ? 'An account with this email already exists' : 'Could not create your account' };
  }
  if (!data.session) return { message: 'Check your email to confirm your account' };
  redirect(as === 'business' ? '/business/onboarding' : '/onboarding');
}

/** Send a magic link. Always reports success to avoid leaking whether the email exists. */
export async function magicLinkAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = loginSchema.shape.email.safeParse(formData.get('email'));
  if (!email.success) return { fieldErrors: { email: 'Enter a valid email' } };
  const supabase = await createServerClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: email.data,
    options: { emailRedirectTo: `${siteUrl()}/auth/callback`, shouldCreateUser: false },
  });
  if (error) log.warn('auth.magic_link_failed', { code: error.code });
  return { message: 'If that email has an account, a sign-in link is on its way' };
}

export async function signOutAction(): Promise<void> {
  const supabase = await createServerClient();
  await supabase.auth.signOut();
  redirect('/login');
}
