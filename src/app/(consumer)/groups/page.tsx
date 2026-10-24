import { UsersRound } from 'lucide-react';
import { PlaceholderPage } from '@/features/core/components/PlaceholderPage';

export const metadata = { title: 'Groups' };

export default function GroupsPage() {
  return <PlaceholderPage title="Groups" owner="matching" icon={UsersRound} lead="Small groups you belong to and plans you're voting on." />;
}
