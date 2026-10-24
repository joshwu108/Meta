import type { ZodError, ZodTypeAny, z } from 'zod';
import { ApiError } from './errors';

/** Flatten a ZodError into `[{ path: 'a.b', message }]` for the error envelope. */
export function zodIssues(error: ZodError): Array<{ path: string; message: string }> {
  return error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }));
}

/**
 * Parse and validate a JSON request body. Throws `ApiError('VALIDATION')` with the field paths
 * in `details` when the body is not JSON or does not match the schema.
 */
export async function parseBody<S extends ZodTypeAny>(schema: S, req: Request): Promise<z.output<S>> {
  const raw = await req
    .json()
    .catch(() => {
      throw new ApiError('VALIDATION', 'Request body must be valid JSON', 400, [
        { path: '', message: 'Invalid JSON' },
      ]);
    });
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new ApiError('VALIDATION', 'Request body failed validation', 400, zodIssues(result.error));
  }
  return result.data as z.output<S>;
}

/** Same as `parseBody` for URL search params (`?page=2&limit=10`). */
export function parseQuery<S extends ZodTypeAny>(schema: S, url: string | URL): z.output<S> {
  const params = Object.fromEntries(new URL(url).searchParams.entries());
  const result = schema.safeParse(params);
  if (!result.success) {
    throw new ApiError('VALIDATION', 'Query parameters failed validation', 400, zodIssues(result.error));
  }
  return result.data as z.output<S>;
}
