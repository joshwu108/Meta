import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getCurrentUser } from '@/features/core';
import { canUseImport } from '@/features/import';
import { SettingsView } from '@/features/import/components/settings-view';

export const metadata = { title: 'Your Instagram taste · CommonGround' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/agent/import/settings');
  if (!(await canUseImport(user.id))) notFound();
  return (
    <main className="mx-auto flex w-full max-w-[680px] flex-col gap-5 px-4 pb-12 pt-6">
      <Link className="text-brand" href="/agent/import">← Bring in your Instagram taste</Link>
      <h1 className="m-0 text-[length:var(--text-xl)] font-bold">Your Instagram taste</h1>
      <SettingsView />
    </main>
  );
}
