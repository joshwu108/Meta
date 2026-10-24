import { NextResponse } from 'next/server';
import { ERROR_STATUS, type ErrorCode } from './errors';

/** Pagination / count metadata attached to list responses. */
export type Meta = { total?: number; page?: number; limit?: number };

export type ApiOk<T> = { ok: true; data: T; meta?: Meta };
export type ApiErr = { ok: false; error: { code: ErrorCode; message: string; details?: unknown } };
export type ApiResponse<T> = ApiOk<T> | ApiErr;

/** Build a success envelope `{ ok: true, data, meta? }`. */
export function okBody<T>(data: T, meta?: Meta): ApiOk<T> {
  return meta === undefined ? { ok: true, data } : { ok: true, data, meta };
}

/** Build an error envelope `{ ok: false, error }`. */
export function failBody(code: ErrorCode, message: string, details?: unknown): ApiErr {
  return details === undefined
    ? { ok: false, error: { code, message } }
    : { ok: false, error: { code, message, details } };
}

/** Success response. Status defaults to 200; pass `init` for 201 or extra headers. */
export function ok<T>(data: T, meta?: Meta, init?: ResponseInit): NextResponse<ApiOk<T>> {
  return NextResponse.json(okBody(data, meta), { status: 200, ...init });
}

/** Error response. Status defaults to the conventional status for `code`. */
export function fail(
  code: ErrorCode,
  message: string,
  status: number = ERROR_STATUS[code],
  details?: unknown,
): NextResponse<ApiErr> {
  return NextResponse.json(failBody(code, message, details), { status });
}
