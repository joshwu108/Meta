'use client';
import { Ban, Flag, MoreHorizontal } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { Button, Sheet } from '@/features/core/components/ui';
import { REPORT_REASON, type ReportReason } from '@/shared/schemas/social';
import { REPORT_REASON_LABELS } from '../labels';
import { textAreaClass } from './ConnectSheet';

type Person = { id: string; displayName: string };

/** Overflow menu on a person card: Block and Report (spec §7, Section 12.3 social safety). */
export function SafetyMenu({ person, onBlock, onReport }: { person: Person; onBlock: (p: Person) => void; onReport: (p: Person) => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!isOpen) return;
    const close = (event: MouseEvent) => !rootRef.current?.contains(event.target as Node) && setIsOpen(false);
    const escape = (event: KeyboardEvent) => event.key === 'Escape' && setIsOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', escape);
    };
  }, [isOpen]);
  const item = 'flex w-full items-center gap-2 rounded-sm px-3 py-2 text-left hover:bg-hover focus-visible:bg-hover';
  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label={`More options for ${person.displayName}`}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
        className="inline-flex h-9 w-9 items-center justify-center rounded-pill text-text-2 hover:bg-hover active:bg-pressed"
      >
        <MoreHorizontal size={20} strokeWidth={1.75} aria-hidden />
      </button>
      {isOpen && (
        <div role="menu" className="rise-in absolute right-0 bottom-11 z-40 w-44 rounded-md bg-surface p-1 shadow-[var(--shadow-3)]">
          <button role="menuitem" type="button" className={item} onClick={() => {
              setIsOpen(false);
              onBlock(person);
            }}>
            <Ban size={16} aria-hidden /> Block
          </button>
          <button role="menuitem" type="button" className={`${item} text-danger`} onClick={() => {
              setIsOpen(false);
              onReport(person);
            }}>
            <Flag size={16} aria-hidden /> Report
          </button>
        </div>
      )}
    </div>
  );
}

export function BlockSheet({ person, isPending, onClose, onConfirm }: { person: Person | null; isPending: boolean; onClose: () => void; onConfirm: (p: Person) => void }) {
  if (!person) return null;
  return (
    <Sheet
      isOpen
      variant="modal"
      onClose={onClose}
      title={`Block ${person.displayName}?`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" isLoading={isPending} onClick={() => onConfirm(person)}>
            Block
          </Button>
        </>
      }
    >
      <p className="text-text-2">You won’t see each other in matches or invite lists. Any request between you ends, and they aren’t told.</p>
    </Sheet>
  );
}

export function ReportSheet({
  person,
  isPending,
  onClose,
  onSubmit,
}: {
  person: Person | null;
  isPending: boolean;
  onClose: () => void;
  onSubmit: (p: Person, reason: ReportReason, details: string) => void;
}) {
  const [reason, setReason] = useState<ReportReason>('harassment');
  const [details, setDetails] = useState('');
  const detailsId = useId();
  useEffect(() => {
    setReason('harassment');
    setDetails('');
  }, [person?.id]);
  if (!person) return null;
  return (
    <Sheet
      isOpen
      onClose={onClose}
      title={`Report ${person.displayName}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" isLoading={isPending} onClick={() => onSubmit(person, reason, details.trim())}>
            Send report
          </Button>
        </>
      }
    >
      <fieldset className="flex flex-col gap-1">
        <legend className="mb-2 text-[length:var(--text-sm)] font-medium text-text-2">What’s going on?</legend>
        {REPORT_REASON.map((value) => (
          <label key={value} className="flex items-center gap-3 rounded-sm px-2 py-2 hover:bg-hover">
            <input type="radio" name="reason" value={value} checked={reason === value} onChange={() => setReason(value)} className="accent-[var(--color-brand)]" />
            {REPORT_REASON_LABELS[value]}
          </label>
        ))}
      </fieldset>
      <label htmlFor={detailsId} className="mt-3 block text-[length:var(--text-sm)] font-medium text-text-2">
        Details (optional)
      </label>
      <textarea id={detailsId} className={`${textAreaClass} mt-1`} maxLength={1000} value={details} onChange={(event) => setDetails(event.target.value)} />
      <p className="mt-2 text-[length:var(--text-sm)] text-text-2">Reports are private. Blocking is a separate step.</p>
    </Sheet>
  );
}
