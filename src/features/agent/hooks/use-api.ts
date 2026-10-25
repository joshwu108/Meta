"use client";

export type ApiFailure = { code: string; message: string };

export class ApiCallError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

/** Call a route that returns the shared `{ ok, data } | { ok: false, error }` envelope. */
export async function api<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(path, {
    method: init?.method ?? "GET",
    headers: init?.body === undefined ? undefined : { "content-type": "application/json" },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const json = (await res.json().catch(() => null)) as
    | { ok: true; data: T }
    | { ok: false; error: ApiFailure }
    | null;
  if (!json) throw new ApiCallError("INTERNAL", "Unexpected response from the server");
  if (!json.ok) throw new ApiCallError(json.error.code, json.error.message);
  return json.data;
}
