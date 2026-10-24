/**
 * Browser-side calls into the API envelope (README §4). Unwraps `ok` and turns `error` into a
 * thrown `ApiClientError` carrying the code and details so forms can show field messages inline.
 * Safe to import from client components; it never touches server-only modules.
 */
import type { ApiResponse } from './envelope';
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

export function isApiClientError(error: unknown): error is ApiClientError {
  return error instanceof ApiClientError;
}

async function send<T>(method: string, url: string, body?: unknown, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      method,
      headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...(init?.headers ?? {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (cause) {
    throw new ApiClientError('INTERNAL', 'Could not reach the server', cause);
  }
  let envelope: ApiResponse<T>;
  try {
    envelope = (await response.json()) as ApiResponse<T>;
  } catch {
    throw new ApiClientError('INTERNAL', `The server returned ${response.status}`);
  }
  if (!envelope.ok) {
    throw new ApiClientError(envelope.error.code, envelope.error.message, envelope.error.details);
  }
  return envelope.data;
}

export const apiGet = <T>(url: string, init?: RequestInit): Promise<T> => send<T>('GET', url, undefined, init);
export const apiPost = <T>(url: string, body?: unknown, init?: RequestInit): Promise<T> => send<T>('POST', url, body, init);
export const apiPatch = <T>(url: string, body?: unknown, init?: RequestInit): Promise<T> => send<T>('PATCH', url, body, init);
export const apiDelete = <T>(url: string, init?: RequestInit): Promise<T> => send<T>('DELETE', url, undefined, init);

type FieldIssue = { path: string; message: string } | { field: string; message: string };

function isFieldIssue(entry: unknown): entry is FieldIssue {
  if (typeof entry !== 'object' || entry === null || !('message' in entry)) return false;
  const record = entry as Record<string, unknown>;
  return typeof record.message === 'string' && (typeof record.path === 'string' || typeof record.field === 'string');
}

/**
 * Field-level messages from `VALIDATION` details, keyed by field name. Accepts both the
 * `{ path, message }` issues `parseBody` emits and `{ field, message }` entries from domain checks.
 */
export function fieldErrors(details: unknown): Record<string, string> {
  if (!Array.isArray(details)) return {};
  return details.filter(isFieldIssue).reduce<Record<string, string>>((acc, entry) => {
    const key = 'path' in entry ? entry.path : entry.field;
    return key in acc ? acc : { ...acc, [key]: entry.message };
  }, {});
}
