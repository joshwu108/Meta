'use client';
import type { ReactNode } from 'react';
import { Button, Sheet } from '@/features/core/components/ui';

export type Confirmation = { title: string; body: ReactNode; confirmLabel: string; tone?: 'primary' | 'danger'; onConfirm: () => void };

/** Small confirm modal for destructive or ownership-changing group actions. */
export function ConfirmSheet({ confirmation, isPending, onClose }: { confirmation: Confirmation | null; isPending: boolean; onClose: () => void }) {
  if (!confirmation) return null;
  return (
    <Sheet
      isOpen
      variant="modal"
      onClose={onClose}
      title={confirmation.title}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant={confirmation.tone === 'danger' ? 'danger' : 'primary'} isLoading={isPending} onClick={confirmation.onConfirm}>
            {confirmation.confirmLabel}
          </Button>
        </>
      }
    >
      <div className="text-text-2">{confirmation.body}</div>
    </Sheet>
  );
}
