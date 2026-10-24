import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AuthCard } from '@/features/core/components/auth/AuthCard';
import { SignupForm } from '@/features/core/components/auth/SignupForm';
import { getCurrentUser } from '@/features/core/server/current-user';

export const metadata = { title: 'Sign up' };

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ as?: string }> }) {
  const user = await getCurrentUser();
  if (user) redirect('/');
  const { as } = await searchParams;
  const mode = as === 'business' ? 'business' : 'consumer';
  return (
    <AuthCard
      title={mode === 'business' ? 'Host your community' : 'Find your people'}
      subtitle={mode === 'business' ? 'Create an account to receive event proposals from nearby demand.' : 'A personal agent that finds compatible people and plans nearby.'}
      footer={
        <>
          Already have an account? <Link href="/login">Log in</Link>
          {mode === 'consumer' ? (
            <>
              {' '}
              · <Link href="/signup?as=business">Sign up as a business</Link>
            </>
          ) : (
            <>
              {' '}
              · <Link href="/signup">Sign up as a member</Link>
            </>
          )}
        </>
      }
    >
      <SignupForm as={mode} />
    </AuthCard>
  );
}
