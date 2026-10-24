/**
 * Shared API layer (README §4). Every Route Handler returns the envelope from `envelope.ts`
 * and is wrapped in `withAuth` / `withBusinessOwner` unless explicitly marked public.
 */
export { ApiError, ERROR_CODES, ERROR_STATUS, isApiError, type ErrorCode } from './errors';
export { ok, fail, okBody, failBody, type ApiOk, type ApiErr, type ApiResponse, type Meta } from './envelope';
export { parseBody, parseQuery, zodIssues } from './parse-body';
export {
  withAuth,
  withBusinessOwner,
  withPublic,
  toErrorResponse,
  type AuthCtx,
  type BusinessCtx,
  EMPTY_CONTEXT,
  type Params,
  type RouteContext,
} from './with-auth';
export { createRateLimiter, aiRateLimiter, type RateLimiter, type RateLimitResult } from './rate-limit';
