import { BarChart3 } from 'lucide-react';
import { PlaceholderPage } from '@/features/core/components/PlaceholderPage';

export const metadata = { title: 'Insights' };

export default function BusinessInsightsPage() {
  return <PlaceholderPage title="Insights" owner="business" icon={BarChart3} lead="Aggregated demand near you. Counts only, never individuals." />;
}
