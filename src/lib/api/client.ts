/**
 * OWNED BY WORKSTREAM 01 (src/lib/api). Browser-side calls into the envelope from
 * specs/README.md section 4: unwrap `ok`, turn `error` into a thrown `ApiClientError`
 * carrying the code and the field details so a form can show them inline.
 */
import type { ErrorCode } from './errors';

export class ApiClientError extends Error {
  readonly code: ErrorCode;
  readonly details?: unknown;

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiClientError';
    this.code = code;
    this.details = details;
  }
}

type Envelope<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: ErrorCode; message: string; details?: unknown } };

async function send<T>(method: string, url: string, body?: unknown): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  let envelope: Envelope<T>;
  try {
    envelope = (await response.json()) as Envelope<T>;
  } catch {
    throw new ApiClientError('INTERNAL', `the server returned ${response.status}`);
  }

  if (!envelope.ok) {
    throw new ApiClientError(envelope.error.code, envelope.error.message, envelope.error.details);
  }
  return envelope.data;
}

export const apiGet = <T>(url: string): Promise<T> => send<T>('GET', url);
export const apiPost = <T>(url: string, body?: unknown): Promise<T> => send<T>('POST', url, body);
export const apiPatch = <T>(url: string, body: unknown): Promise<T> => send<T>('PATCH', url, body);

/** Field-level messages from `validateEventAgainstCapabilities`, keyed by field name. */
export function fieldErrors(details: unknown): Record<string, string> {
  if (!Array.isArray(details)) return {};
  return details.reduce<Record<string, string>>((acc, entry) => {
    if (
      typeof entry === 'object' &&
      entry !== null &&
      'field' in entry &&
      'message' in entry &&
      typeof (entry as { field: unknown }).field === 'string' &&
      typeof (entry as { message: unknown }).message === 'string'
    ) {
      const { field, message } = entry as { field: string; message: string };
      return { ...acc, [field]: message };
    }
    return acc;
  }, {});
}
