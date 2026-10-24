import { CalendarDays } from 'lucide-react';
import { PlaceholderPage } from '@/features/core/components/PlaceholderPage';

export const metadata = { title: 'Events' };

export default function EventsPage() {
  return <PlaceholderPage title="Events" owner="events and recommendations" icon={CalendarDays} lead="Upcoming events at local venues." />;
}
