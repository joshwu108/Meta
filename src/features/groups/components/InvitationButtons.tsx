'use client';
import { useRouter } from 'next/navigation';
import { Button, useToast } from '@/features/core/components/ui';
import { useApiAction } from '@/lib/api/use-api-action';

/** Accept / Decline for a pending group invitation (PATCH /api/invitations/:id). */
export function InvitationButtons({ invitationId, groupId, groupName }: { invitationId: string; groupId: string; groupName: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const { run, isPending } = useApiAction(toast);
  const answer = async (status: 'accepted' | 'declined') => {
    const done = await run(status, `/api/invitations/${invitationId}`, { method: 'PATCH', body: { status } }, {
      success: status === 'accepted' ? `You joined ${groupName}` : 'Invitation declined',
      refresh: status === 'declined',
    });
    if (done && status === 'accepted') router.push(`/groups/${groupId}`);
  };
  return (
    <div className="flex shrink-0 items-center gap-2">
      <Button variant="secondary" isLoading={isPending('declined')} onClick={() => answer('declined')}>
        Decline
      </Button>
      <Button isLoading={isPending('accepted')} onClick={() => answer('accepted')}>
        Accept
      </Button>
    </div>
  );
}
