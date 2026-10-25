'use client';
import { useActionState, useState } from 'react';
import { magicLinkAction, signInAction, type AuthFormState } from '@/features/core/server/auth-actions';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Tabs } from '../ui/Tabs';

type Mode = 'password' | 'magic';
const MODES = [
  { value: 'password', label: 'Password' },
  { value: 'magic', label: 'Magic link' },
] as const;

const initial: AuthFormState = {};

export function LoginForm({ next }: { next?: string }) {
  const [mode, setMode] = useState<Mode>('password');
  const [pwState, pwAction, pwPending] = useActionState(signInAction, initial);
  const [mlState, mlAction, mlPending] = useActionState(magicLinkAction, initial);
  const state = mode === 'password' ? pwState : mlState;
  return (
    <div className="flex flex-col gap-4">
      <Tabs items={MODES} value={mode} onChange={setMode} ariaLabel="Sign-in method" />
      <form action={mode === 'password' ? pwAction : mlAction} className="flex flex-col gap-4" noValidate>
        {next && <input type="hidden" name="next" value={next} />}
        <Input label="Email" name="email" type="email" autoComplete="email" required error={state.fieldErrors?.email} />
        {mode === 'password' && (
          <Input label="Password" name="password" type="password" autoComplete="current-password" required error={state.fieldErrors?.password} />
        )}
        {state.error && (
          <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-[length:var(--text-sm)] text-danger-ink">
            {state.error}
          </p>
        )}
        {state.message && (
          <p role="status" className="rounded-md bg-success-soft px-3 py-2 text-[length:var(--text-sm)] text-success-ink">
            {state.message}
          </p>
        )}
        <Button type="submit" size="lg" isLoading={pwPending || mlPending} className="w-full">
          {mode === 'password' ? 'Log in' : 'Email me a link'}
        </Button>
      </form>
    </div>
  );
}
