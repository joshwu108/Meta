import { CalendarDays } from 'lucide-react';
import { PlaceholderPage } from '@/features/core/components/PlaceholderPage';

export const metadata = { title: 'Events' };

export default function BusinessEventsPage() {
  return <PlaceholderPage title="Events" owner="business" icon={CalendarDays} lead="Published and draft events at your venue." />;
}
