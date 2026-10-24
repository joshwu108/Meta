import { LayoutDashboard } from 'lucide-react';
import { PlaceholderPage } from '@/features/core/components/PlaceholderPage';

export const metadata = { title: 'Dashboard' };

export default function BusinessDashboardPage() {
  return <PlaceholderPage title="Dashboard" owner="business" icon={LayoutDashboard} lead="Your venue at a glance: proposals waiting, upcoming events, attendance." />;
}
