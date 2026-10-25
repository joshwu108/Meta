import Link from 'next/link';
import { Card } from '@/features/core/components/ui';

/** Small entry on /discover (shown only when 07 is available to the viewer). */
export function ImportDiscoverCard({ pending }: { pending: number }) {
  return (
    <Card as="section" aria-labelledby="import-card-title">
      <h2 id="import-card-title" className="m-0 text-[length:var(--text-lg)]">Your plan</h2>
      <p className="mt-1 text-text-2">
        {pending > 0
          ? `${pending} suggestion${pending === 1 ? '' : 's'} from your Instagram taste waiting for you.`
          : 'Bring in your Instagram taste and get a short plan of people, places and events to try.'}
      </p>
      <Link className="font-semibold text-brand" href="/agent/import">{pending > 0 ? 'Review them' : 'Bring in your Instagram taste'}</Link>
    </Card>
  );
}
