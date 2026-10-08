// Sign-in attempts per visitor, so the public sign-in endpoints can't be hammered.
import { TRUST_PROXY } from "../infra/config";

const WINDOW_MS = 10 * 60_000;
const MAX = 30;
const hits = new Map<string, number[]>();

/** Record an attempt from `who`; false once it made MAX in the last ten minutes. */
export function allowAttempt(who: string, now = Date.now()) {
  const recent = (hits.get(who) ?? []).filter((t) => now - t < WINDOW_MS);
  const ok = recent.length < MAX;
  if (ok) recent.push(now);
  hits.set(who, recent);
  if (hits.size > 10_000) for (const [k, v] of hits) if (!v.some((t) => now - t < WINDOW_MS)) hits.delete(k);
  return ok;
}

/** The visitor's IP: from the proxy's X-Forwarded-For when one is trusted, else the connection. */
export function visitorIp(req: Request, server: { requestIP(req: Request): { address: string } | null }) {
  if (TRUST_PROXY) {
    const fwd = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    if (fwd) return fwd;
  }
  return server.requestIP(req)?.address ?? "unknown";
}
