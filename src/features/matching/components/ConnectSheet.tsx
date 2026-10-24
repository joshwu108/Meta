'use client';
import { useEffect, useId, useState } from 'react';
import { Button, Sheet } from '@/features/core/components/ui';

const MAX_MESSAGE = 280;

export const textAreaClass =
  'min-h-24 w-full resize-y rounded-sm border border-divider bg-surface px-3 py-2 text-text placeholder:text-text-3 ' +
  'transition-colors duration-[var(--duration-fast)] focus:border-brand focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-brand';

type Props = {
  person: { id: string; displayName: string } | null;
  isSending: boolean;
  onClose: () => void;
  onSend: (personId: string, message: string) => void;
};

/** Optional note with a connection request (Screen 3 "Connect"). */
export function ConnectSheet({ person, isSending, onClose, onSend }: Props) {
  const [message, setMessage] = useState('');
  const fieldId = useId();
  useEffect(() => setMessage(''), [person?.id]);
  if (!person) return null;
  return (
    <Sheet
      isOpen
      onClose={onClose}
      title={`Connect with ${person.displayName}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => onSend(person.id, message.trim())} isLoading={isSending}>
            Send request
          </Button>
        </>
      }
    >
      <label htmlFor={fieldId} className="text-[length:var(--text-sm)] font-medium text-text-2">
        Add a note (optional)
      </label>
      <textarea
        id={fieldId}
        className={`${textAreaClass} mt-1`}
        maxLength={MAX_MESSAGE}
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        placeholder="Say hi, or suggest something you'd both enjoy."
      />
      <p className="mt-1 text-right text-[length:var(--text-xs)] text-text-3">
        {message.length}/{MAX_MESSAGE}
      </p>
      <p className="mt-2 text-[length:var(--text-sm)] text-text-2">They’ll see your profile card and your note.</p>
    </Sheet>
  );
}
