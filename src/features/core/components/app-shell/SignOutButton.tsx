import { LogOut } from 'lucide-react';
import { signOutAction } from '@/features/core/server/auth-actions';

/** Form-based sign out so it works without client JS. */
export function SignOutButton() {
  return (
    <form action={signOutAction}>
      <button
        type="submit"
        aria-label="Sign out"
        title="Sign out"
        className="inline-flex h-9 w-9 items-center justify-center rounded-pill text-text-2 transition-colors duration-[var(--duration-fast)] hover:bg-hover active:bg-pressed"
      >
        <LogOut size={18} strokeWidth={1.75} aria-hidden />
      </button>
    </form>
  );
}
