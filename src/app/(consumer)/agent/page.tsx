import { Bot } from 'lucide-react';
import { PlaceholderPage } from '@/features/core/components/PlaceholderPage';

export const metadata = { title: 'Agent' };

export default function AgentPage() {
  return <PlaceholderPage title="Agent" owner="agent" icon={Bot} lead="Chat with your agent and manage what it may share." />;
}
