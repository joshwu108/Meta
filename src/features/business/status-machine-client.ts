import type { EventStatus } from '@/shared/enums';

/**
 * The two status questions the client needs to answer, mirrored from
 * `server/status-machine.ts`. That module is `server-only`, and a row action has to decide
 * whether to offer Publish or Cancel without pulling the server graph into the bundle.
 * `tests/unit/business/status-machine.test.ts` asserts the two stay in step.
 */

const CANCELLABLE: readonly EventStatus[] = ['approved_draft', 'published', 'full'];

export const isCancellable = (status: EventStatus): boolean => CANCELLABLE.includes(status);

export const isPublishable = (status: EventStatus): boolean => status === 'approved_draft';
