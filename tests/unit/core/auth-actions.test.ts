import { beforeEach, describe, expect, it, vi } from 'vitest';

const redirect = vi.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`);
});
vi.mock('next/navigation', () => ({ redirect }));

const auth = {
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  signInWithOtp: vi.fn(),
  signOut: vi.fn(),
};
vi.mock('@/lib/supabase/server', () => ({ createServerClient: vi.fn(async () => ({ auth })) }));

const { magicLinkAction, signInAction, signOutAction, signUpAction } = await import('@/features/core/server/auth-actions');

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

beforeEach(() => {
  redirect.mockClear();
  for (const fn of Object.values(auth)) fn.mockReset();
});

describe('signInAction', () => {
  it('returns field errors for an invalid email', async () => {
    const state = await signInAction({}, form({ email: 'nope', password: 'x' }));
    expect(state.fieldErrors).toHaveProperty('email');
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it('returns a generic error when credentials are wrong', async () => {
    auth.signInWithPassword.mockResolvedValue({ error: { code: 'invalid_credentials' } });
    const state = await signInAction({}, form({ email: 'a@b.co', password: 'wrong-pass' }));
    expect(state.error).toMatch(/incorrect/);
  });

  it('redirects to next (or /) on success', async () => {
    auth.signInWithPassword.mockResolvedValue({ error: null });
    await expect(signInAction({}, form({ email: 'a@b.co', password: 'right-pass', next: '/events' }))).rejects.toThrow('REDIRECT:/events');
    await expect(signInAction({}, form({ email: 'a@b.co', password: 'right-pass' }))).rejects.toThrow('REDIRECT:/');
    await expect(signInAction({}, form({ email: 'a@b.co', password: 'right-pass', next: '/\\evil.com' }))).rejects.toThrow('REDIRECT:/');
    await expect(signInAction({}, form({ email: 'a@b.co', password: 'right-pass', next: 'https://evil.com' }))).rejects.toThrow('REDIRECT:/');
  });
});

describe('signUpAction', () => {
  const valid = { email: 'new@b.co', password: 'longenough', display_name: 'New', is_adult_confirmed: 'on' };

  it('requires the adult confirmation', async () => {
    const state = await signUpAction({}, form({ ...valid, is_adult_confirmed: '' }));
    expect(state.fieldErrors?.is_adult_confirmed).toMatch(/18/);
  });

  it('sends display name and adult flag as user metadata and redirects by role', async () => {
    auth.signUp.mockResolvedValue({ data: { session: {} }, error: null });
    await expect(signUpAction({}, form(valid))).rejects.toThrow('REDIRECT:/onboarding');
    expect(auth.signUp.mock.calls[0]![0].options.data).toMatchObject({ display_name: 'New', is_adult_confirmed: true, signup_as: 'consumer' });
    await expect(signUpAction({}, form({ ...valid, as: 'business' }))).rejects.toThrow('REDIRECT:/business/onboarding');
    expect(auth.signUp.mock.calls[1]![0].options.emailRedirectTo).toContain('next=%2Fbusiness%2Fonboarding');
  });

  it('asks to confirm email when no session is returned', async () => {
    auth.signUp.mockResolvedValue({ data: { session: null }, error: null });
    const state = await signUpAction({}, form(valid));
    expect(state.message).toMatch(/Check your email/);
  });

  it('maps duplicate accounts to a friendly error', async () => {
    auth.signUp.mockResolvedValue({ data: {}, error: { code: 'user_already_exists', message: 'User already registered' } });
    const state = await signUpAction({}, form(valid));
    expect(state.error).toMatch(/already exists/);
    auth.signUp.mockResolvedValue({ data: {}, error: { code: 'x', message: 'other' } });
    expect((await signUpAction({}, form(valid))).error).toMatch(/Could not create/);
  });
});

describe('magicLinkAction', () => {
  it('validates the email and never reveals whether it exists', async () => {
    expect((await magicLinkAction({}, form({ email: 'bad' }))).fieldErrors?.email).toBeDefined();
    auth.signInWithOtp.mockResolvedValue({ error: null });
    const ok = await magicLinkAction({}, form({ email: 'a@b.co' }));
    auth.signInWithOtp.mockResolvedValue({ error: { code: 'otp_disabled' } });
    const failed = await magicLinkAction({}, form({ email: 'a@b.co' }));
    expect(ok.message).toBe(failed.message);
    expect(auth.signInWithOtp.mock.calls[0]![0].options.shouldCreateUser).toBe(false);
  });
});

describe('signOutAction', () => {
  it('signs out and redirects to /login', async () => {
    auth.signOut.mockResolvedValue({ error: null });
    await expect(signOutAction()).rejects.toThrow('REDIRECT:/login');
    expect(auth.signOut).toHaveBeenCalled();
  });
});
