/**
 * OWNED BY WORKSTREAM 01 (src/lib/api). Transcribed from specs/README.md section 4 so
 * workstream 05 throws and maps the real error codes before 01's envelope lands.
 * Main wins on the next sync.
 */
export const ERROR_CODES = [
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'VALIDATION',
  'CONFLICT',
  'CAPACITY_FULL',
  'RATE_LIMITED',
  'AI_UNAVAILABLE',
  'INTERNAL',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

const DEFAULT_STATUS: Record<ErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION: 422,
  CONFLICT: 409,
  CAPACITY_FULL: 409,
  RATE_LIMITED: 429,
  AI_UNAVAILABLE: 503,
  INTERNAL: 500,
};

export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: ErrorCode, message: string, status?: number, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status ?? DEFAULT_STATUS[code];
    this.details = details;
  }
}

export const isApiError = (err: unknown): err is ApiError =>
  err instanceof ApiError || (typeof err === 'object' && err !== null && 'code' in err && 'status' in err);

export const statusForCode = (code: ErrorCode): number => DEFAULT_STATUS[code];
