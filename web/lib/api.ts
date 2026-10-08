/** JSON fetch against the OpenLeo server; throws the server's `error` message on failure. */
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, { headers: { "content-type": "application/json" }, ...init });
  if (r.status === 401 && location.pathname !== "/login") toLogin();
  if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error ?? `HTTP ${r.status}`);
  return (r.status === 204 ? null : r.json()) as T;
}

export const json = (body: unknown, method = "POST"): RequestInit => ({ method, body: JSON.stringify(body) });

/** Signed out (or the session expired): go to the login page, then come back here. */
export function toLogin() {
  location.assign(`/login?next=${encodeURIComponent(location.pathname + location.search)}`);
}
