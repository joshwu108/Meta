/** Error codes shared by every Route Handler (README §4). */
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

/** Default HTTP status for each code. `fail()` uses these when no status is passed. */
export const ERROR_STATUS: Record<ErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION: 400,
  CONFLICT: 409,
  CAPACITY_FULL: 409,
  RATE_LIMITED: 429,
  AI_UNAVAILABLE: 503,
  INTERNAL: 500,
};

/**
 * Throw this anywhere inside a handler wrapped by `withAuth` / `withBusinessOwner` and it is
 * converted into the error envelope with the given status.
 */
export class ApiError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly status: number = ERROR_STATUS[code],
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}
