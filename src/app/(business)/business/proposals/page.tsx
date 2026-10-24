import { Inbox } from 'lucide-react';
import { PlaceholderPage } from '@/features/core/components/PlaceholderPage';

export const metadata = { title: 'Proposals' };

export default function BusinessProposalsPage() {
  return <PlaceholderPage title="Proposals" owner="business" icon={Inbox} lead="AI-generated event proposals routed to your venue. Approve, edit or reject." />;
}
