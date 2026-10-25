import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getCurrentUser } from '@/features/core';
import { canUseImport } from '@/features/import';
import { ImportPage } from '@/features/import/components/import-page';

export const metadata = { title: 'Bring in your Instagram taste · CommonGround' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/agent/import');
  if (!(await canUseImport(user.id))) notFound();
  return (
    <main className="mx-auto flex w-full max-w-[1040px] flex-col gap-5 px-4 pb-12 pt-6">
      <div className="flex flex-wrap justify-between gap-2">
        <Link className="text-brand" href="/agent/preferences">← Preferences</Link>
        <Link className="text-brand" href="/agent/import/settings">What came from Instagram</Link>
      </div>
      <div>
        <h1 className="m-0 text-[length:var(--text-xl)] font-bold">Bring in your Instagram taste</h1>
        <p className="mt-1 text-text-2">
          Show your agent what Instagram already knows about your taste, without logging in to Instagram. You choose what to share and approve every suggestion.
        </p>
      </div>
      <ImportPage />
    </main>
  );
}
