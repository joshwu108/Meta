// Browser-side calls to 06's routes; returns data or throws the envelope's message.
export async function send<T = unknown>(path: string, method: "POST" | "DELETE" | "PATCH" | "GET", body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json().catch(() => null)) as { ok: boolean; data?: T; error?: { message: string } } | null;
  if (!json?.ok) throw new Error(json?.error?.message ?? "Something went wrong");
  return json.data as T;
}
