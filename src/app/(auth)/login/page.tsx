import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AuthCard } from '@/features/core/components/auth/AuthCard';
import { LoginForm } from '@/features/core/components/auth/LoginForm';
import { getCurrentUser } from '@/features/core/server/current-user';

export const metadata = { title: 'Log in' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const user = await getCurrentUser();
  if (user) redirect('/');
  const { next } = await searchParams;
  const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : undefined;
  return (
    <AuthCard
      title="Welcome back"
      subtitle="Log in to see who's around this week."
      footer={
        <>
          New here? <Link href="/signup">Create an account</Link> · <Link href="/signup?as=business">For businesses</Link>
        </>
      }
    >
      <LoginForm next={safeNext} />
    </AuthCard>
  );
}
