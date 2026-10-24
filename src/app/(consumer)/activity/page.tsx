import { Activity } from 'lucide-react';
import { PlaceholderPage } from '@/features/core/components/PlaceholderPage';

export const metadata = { title: 'Activity' };

export default function ActivityPage() {
  return <PlaceholderPage title="Activity" owner="events and recommendations" icon={Activity} lead="Your RSVPs, connections and follow-ups." />;
}
