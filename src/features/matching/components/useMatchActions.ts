'use client';
import { useState } from 'react';
import { useToast } from '@/features/core/components/ui';
import { useApiAction } from '@/lib/api/use-api-action';
import type { ReportReason } from '@/shared/schemas/social';
import type { ConnectionItem } from '../server/connections';

export type Person = { id: string; displayName: string };

/** Which person each sheet is open for, plus cards hidden after connect/block. */
function usePeopleSheets() {
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const [connectTo, setConnectTo] = useState<Person | null>(null);
  const [blockTarget, setBlockTarget] = useState<Person | null>(null);
  const [reportTarget, setReportTarget] = useState<Person | null>(null);
  const hide = (id: string) => setHidden((current) => new Set([...current, id]));
  return { hidden, hide, connectTo, setConnectTo, blockTarget, setBlockTarget, reportTarget, setReportTarget };
}

/** Mutations behind the match screen: connect, block, report and answer requests. */
export function useMatchActions() {
  const { toast } = useToast();
  const { run, isPending } = useApiAction(toast);
  const sheets = usePeopleSheets();

  const sendRequest = async (personId: string, message: string) => {
    const body = { recipientId: personId, ...(message ? { message } : {}) };
    const success = `Request sent to ${sheets.connectTo?.displayName ?? 'them'}`;
    if (await run('connect', '/api/connections', { method: 'POST', body }, { success })) {
      sheets.hide(personId);
      sheets.setConnectTo(null);
    }
  };
  const block = async (person: Person) => {
    if (await run('block', `/api/users/${person.id}/block`, { method: 'POST' }, { success: `${person.displayName} is blocked` })) {
      sheets.hide(person.id);
      sheets.setBlockTarget(null);
    }
  };
  const report = async (person: Person, reason: ReportReason, details: string) => {
    const body = { reason, ...(details ? { details } : {}) };
    const options = { success: 'Thanks. Your report was sent.', refresh: false };
    if (await run('report', `/api/users/${person.id}/report`, { method: 'POST', body }, options)) sheets.setReportTarget(null);
  };
  const answer = (item: ConnectionItem, status: 'accepted' | 'declined') => {
    const success = status === 'accepted' ? `You’re connected with ${item.user.displayName}` : 'Request declined';
    const key = `${status === 'accepted' ? 'accept' : 'decline'}:${item.id}`;
    return run(key, `/api/connections/${item.id}`, { method: 'PATCH', body: { status } }, { success });
  };
  return { ...sheets, sendRequest, block, report, answer, isPending };
}
