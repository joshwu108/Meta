'use client';
import { UserPlus } from 'lucide-react';
import { Button, useToast } from '@/features/core/components/ui';
import { useApiAction } from '@/lib/api/use-api-action';

/** "Join group" on a public interest group the viewer is not in (POST /api/groups/:id/join). */
export function JoinButton({ groupId, groupName }: { groupId: string; groupName: string }) {
  const { toast } = useToast();
  const { run, isPending } = useApiAction(toast);
  const join = () => run('join', `/api/groups/${groupId}/join`, { method: 'POST' }, { success: `You joined ${groupName}` });
  return (
    <Button leadingIcon={<UserPlus size={16} aria-hidden />} isLoading={isPending('join')} onClick={join}>
      Join group
    </Button>
  );
}
