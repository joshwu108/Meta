'use client';
import { useActionState } from 'react';
import { signUpAction, type AuthFormState } from '@/features/core/server/auth-actions';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';

const initial: AuthFormState = {};

export function SignupForm({ as }: { as: 'consumer' | 'business' }) {
  const [state, action, isPending] = useActionState(signUpAction, initial);
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="as" value={as} />
      <Input label={as === 'business' ? 'Your name' : 'Display name'} name="display_name" autoComplete="name" required maxLength={60} error={state.fieldErrors?.display_name} />
      <Input label="Email" name="email" type="email" autoComplete="email" required error={state.fieldErrors?.email} />
      <Input label="Password" name="password" type="password" autoComplete="new-password" required minLength={8} hint="At least 8 characters" error={state.fieldErrors?.password} />
      <label className="flex items-start gap-3 text-[length:var(--text-sm)]">
        <input type="checkbox" name="is_adult_confirmed" required className="mt-0.5 h-4 w-4 accent-[var(--color-brand)]" />
        <span>
          I confirm I am 18 or older.
          {state.fieldErrors?.is_adult_confirmed && <span className="block text-danger">{state.fieldErrors.is_adult_confirmed}</span>}
        </span>
      </label>
      {state.error && (
        <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-[length:var(--text-sm)] text-danger">
          {state.error}
        </p>
      )}
      {state.message && (
        <p role="status" className="rounded-md bg-success-soft px-3 py-2 text-[length:var(--text-sm)] text-success">
          {state.message}
        </p>
      )}
      <Button type="submit" size="lg" isLoading={isPending} className="w-full">
        {as === 'business' ? 'Create business account' : 'Create account'}
      </Button>
    </form>
  );
}
