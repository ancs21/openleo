// Browser sessions for "Continue with ChatGPT". The browser holds a random id in an HttpOnly cookie; the server
// keeps only its SHA-256 hash (sessions.json, owner-only), so a copy of the file can't be used to sign in.
// Sessions last 30 days from last use.
import { HOME, PUBLIC_ORIGIN, PUBLIC_URL } from "./config";
import { tailnetOrigin } from "./tailnet";
import { writePrivate } from "./private-file";

const FILE = `${HOME}/sessions.json`;
const COOKIE = "openleo_session";
const TTL_MS = 30 * 24 * 3600_000;
const TOUCH_MS = 3600_000; // refresh "last seen" at most hourly, so requests don't rewrite the file

/** `account`: the account key (see accountKey in siwc.ts). */
export type Session = { account: string; email?: string; created: number; seen: number };

const hash = (id: string) => new Bun.CryptoHasher("sha256").update(id).digest("hex");
const sessions = new Map<string, Session>(
  Object.entries((await Bun.file(FILE).exists()) ? ((await Bun.file(FILE).json()) as Record<string, Session>) : {}),
);

let saving = Promise.resolve();
function persist() {
  for (const [k, s] of sessions) if (Date.now() - s.seen > TTL_MS) sessions.delete(k);
  saving = saving.then(async () => {
    await writePrivate(FILE, JSON.stringify(Object.fromEntries(sessions), null, 2));
  });
  return saving;
}

const cookieValue = (req: Request, name: string) =>
  req.headers.get("cookie")?.split(/;\s*/).find((c) => c.startsWith(`${name}=`))?.slice(name.length + 1);
const idOf = (req: Request) => cookieValue(req, COOKIE);

// The account this browser signed in as last (a tenant id, not a secret), so the next sign-in reuses its
// ChatGPT registration instead of registering OpenLeo again.
const ACCOUNT = "openleo_account";
export const accountOf = (req: Request) => cookieValue(req, ACCOUNT);
export const rememberAccount = (req: Request, tenant: string) => cookie(req, tenant, 365 * 24 * 3600, ACCOUNT);
export const forgetAccount = (req: Request) => cookie(req, "", 0, ACCOUNT);

/** The signed-in session for this request, or null. */
export function sessionOf(req: Request): Session | null {
  const id = idOf(req);
  const s = id ? sessions.get(hash(id)) : undefined;
  if (!s) return null;
  if (Date.now() - s.seen > TTL_MS) { sessions.delete(hash(id!)); void persist(); return null; }
  if (Date.now() - s.seen > TOUCH_MS) { s.seen = Date.now(); void persist(); }
  return s;
}

/** Start a session; returns the Set-Cookie header value. */
export async function createSession(req: Request, account: string, email?: string) {
  const id = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url");
  sessions.set(hash(id), { account, email, created: Date.now(), seen: Date.now() });
  await persist();
  return cookie(req, id, TTL_MS / 1000);
}

/** End this request's session; returns the Set-Cookie header value that clears it. */
export async function destroySession(req: Request) {
  const id = idOf(req);
  if (id && sessions.delete(hash(id))) await persist();
  return cookie(req, "", 0);
}

// Secure follows the public address: behind an HTTPS proxy the request itself arrives as plain http.
function cookie(_req: Request, value: string, maxAgeSeconds: number, name = COOKIE) {
  const secure = PUBLIC_URL.protocol === "https:" ? "; Secure" : "";
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
}

/** Only same-origin pages may change things: a cross-site form or script can't act with your session. */
export function sameOrigin(req: Request) {
  if (req.method === "GET" || req.method === "HEAD") return true;
  const origin = req.headers.get("origin");
  return !origin || origin === PUBLIC_ORIGIN || origin === tailnetOrigin() || origin === new URL(req.url).origin;
}
