// Sign in with ChatGPT. Each tenant has its own registration (<tenant>/chatgpt.json) and its tokens in its vault,
// in pi's credential format under "openai", so pi-ai's built-in token refresh keeps working.
import { rm } from "node:fs/promises";
import { writePrivate } from "./private-file";
import { piAuth, tenantCredentials } from "./credentials";
import { vaultSet } from "./vault";
import { tenantDir, tenantId } from "./tenant";
import { CHATGPT_CLIENT_ID } from "./config";

export const APP_NAME = "OpenLeo";
const ISSUER = "https://auth.openai.com";
const AUTHORIZE_URL = `${ISSUER}/api/accounts/authorize`;
const TOKEN_URL = `${ISSUER}/api/accounts/oauth/token`;
const RESOURCE = "https://api.openai.com/v1";
const PLAN_SCOPE = "chatgpt.tokens.use.direct";
const SCOPE = `openid profile email offline_access resource.invoke ${PLAN_SCOPE}`;
const EXPIRY_MARGIN_MS = 3 * 60_000; // same margin pi uses, so a request never starts on a dying token
const PENDING_TTL_MS = 10 * 60_000;
// Hosted installs use a pre-registered client for their public callback; local ones register themselves.
const FIXED_CLIENT_ID = CHATGPT_CLIENT_ID;

const DIR = `${process.env.HOME}/.config/openleo`;
const HOST_ID_FILE = `${DIR}/host-id`;
const LEGACY_REG = `${DIR}/chatgpt.json`; // the single registration from before accounts had their own

// Kept across sign-outs (only id_token is cleared). One made under an older `app_name` is replaced on next sign-in.
type Registration = { client_id: string; sub: string; email?: string; id_token?: string; app_name?: string };

const b64url = (b: ArrayBuffer | Uint8Array) => Buffer.from(b instanceof Uint8Array ? b : new Uint8Array(b)).toString("base64url");
const random = () => b64url(crypto.getRandomValues(new Uint8Array(32)));


export async function hostId() {
  const f = Bun.file(HOST_ID_FILE);
  if (await f.exists()) {
    const id = (await f.text()).trim();
    return id.includes(":") ? id : `urn:uuid:${id}`; // early installs stored a bare UUID
  }
  const id = `urn:uuid:${crypto.randomUUID()}`;
  await writePrivate(HOST_ID_FILE, id);
  return id;
}

const regFile = (tenant: string) => `${tenantDir(tenant)}/chatgpt.json`;
async function readReg(tenant?: string): Promise<Registration | null> {
  const f = Bun.file(tenant ? regFile(tenant) : LEGACY_REG);
  return (await f.exists()) ? f.json() : null;
}

type Oidc = { issuer: string; jwks_uri: string; revocation_endpoint: string };
let discovery: Promise<Oidc> | null = null;
const oidc = () => (discovery ??= fetch(`${ISSUER}/.well-known/openid-configuration`).then((r) => {
  if (!r.ok) throw new Error(`OpenID discovery failed (${r.status})`);
  return r.json() as Promise<Oidc>;
})).catch((e) => ((discovery = null), Promise.reject(e)));

export type Jwks = { keys: ({ kid?: string } & Record<string, unknown>)[] };
export type IdClaims = { iss: string; sub: string; aud: string | string[]; exp: number; nonce?: string; email?: string; email_verified?: boolean };

/** The verified email, lowercased: `sub` changes whenever OpenLeo registers again, and there's no other stable id. */
export function accountKey(claims: Pick<IdClaims, "email" | "email_verified">) {
  const email = claims.email?.trim().toLowerCase();
  if (!email || claims.email_verified !== true) throw new Error("Your ChatGPT account needs a verified email to sign in to OpenLeo.");
  return email;
}

export async function verifyIdToken(token: string, opts: { jwks: Jwks; issuer: string; clientId: string; nonce: string; now?: number }) {
  const [h, p, s] = token.split(".");
  if (!h || !p || !s) throw new Error("malformed ID token");
  const header = JSON.parse(Buffer.from(h, "base64url").toString());
  if (header.alg !== "RS256") throw new Error(`unsupported ID token alg ${header.alg}`);
  const jwk = opts.jwks.keys.find((k) => k.kid === header.kid);
  if (!jwk) throw new Error("ID token signing key not found");
  const key = await crypto.subtle.importKey("jwk", jwk as any, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, Buffer.from(s, "base64url"), new TextEncoder().encode(`${h}.${p}`));
  if (!ok) throw new Error("ID token signature invalid");
  const c: IdClaims = JSON.parse(Buffer.from(p, "base64url").toString());
  const aud = Array.isArray(c.aud) ? c.aud : [c.aud];
  if (c.iss !== opts.issuer) throw new Error("ID token issuer mismatch");
  if (!aud.includes(opts.clientId)) throw new Error("ID token audience mismatch");
  if (!(c.exp * 1000 > (opts.now ?? Date.now()))) throw new Error("ID token expired");
  if (c.nonce !== opts.nonce) throw new Error("ID token nonce mismatch");
  if (!c.sub) throw new Error("ID token has no subject");
  return c;
}

// `hint`: the account this browser signed in as last time (its registration is reused); `legacy`: the old shared one.
type Pending = { verifier: string; nonce: string; redirectUri: string; clientId: string | null; created: number; next: string; hint?: string; legacy?: Registration };
// Kept on globalThis so a sign-in that's under way survives the dev server reloading code (bun --hot).
const g = globalThis as { openleoSignIns?: Map<string, Pending> };
const pending = (g.openleoSignIns ??= new Map<string, Pending>());

let lastError: string | undefined;

/** Returns the sign-in URL. `next`: app path to return to; `hint`: the account this browser used last. */
export async function startLogin(redirectUri: string, next = "/", hint?: string) {
  for (const [k, v] of pending) if (Date.now() - v.created > PENDING_TTL_MS) pending.delete(k);
  const own = hint ? await readReg(hint) : null;
  const legacy = own ? null : await readReg();
  const reg = own ?? legacy;
  const reuse = reg?.app_name === APP_NAME ? reg : null; // else register again under the current name
  const state = random(), nonce = random(), verifier = random();
  const challenge = b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  pending.set(state, { verifier, nonce, redirectUri, clientId: FIXED_CLIENT_ID ?? reuse?.client_id ?? null, created: Date.now(), next, hint: own ? hint : undefined, legacy: legacy ?? undefined });
  lastError = undefined;

  const params: Record<string, string> = {
    client_id: FIXED_CLIENT_ID ?? reuse?.client_id ?? "dynamic_agent_client",
    ext_agent_host_id: await hostId(),
    response_type: "code",
    redirect_uri: redirectUri,
    scope: SCOPE,
    resource: RESOURCE,
    state,
    nonce,
    code_challenge: challenge,
    code_challenge_method: "S256",
  };
  if (!reuse && !FIXED_CLIENT_ID) params.agent_name_hint = APP_NAME; // new registrations only
  if (reuse?.id_token) params.id_token_hint = reuse.id_token; // issued for that client: only valid when reusing it
  if (reg?.email) params.login_hint = reg.email;
  // The URL contains id_token_hint: never log it.
  return { url: `${AUTHORIZE_URL}?${new URLSearchParams(params)}` };
}

type SignIn = { account: string; sub: string; email?: string; next: string; clientId: string; idToken: string; cred: object; hint?: string; legacy?: Registration };

/** Verify the callback and exchange the code. Nothing is stored yet: the caller admits the account first. */
async function finishLogin(url: URL): Promise<SignIn> {
  const state = url.searchParams.get("state") ?? "";
  const p = pending.get(state);
  if (!p) throw Object.assign(new Error("Unknown or expired sign-in attempt. Start again."), { stray: true });
  pending.delete(state);
  if (Date.now() - p.created > PENDING_TTL_MS) throw new Error("Sign-in attempt expired. Start again.");

  const error = url.searchParams.get("error");
  if (error === "access_denied") throw new Error("ChatGPT plan use wasn't enabled. You can try again any time.");
  if (error) throw new Error(`ChatGPT sign-in failed: ${error}`);

  const code = url.searchParams.get("code");
  if (!code) throw new Error("Callback had no authorization code");
  const returned = url.searchParams.get("client_id");
  if (p.clientId && returned && returned !== p.clientId) throw new Error("Callback returned a different client ID; rejected.");
  const clientId = p.clientId ?? returned;
  if (!clientId || clientId === "dynamic_agent_client") throw new Error("Registration incomplete: no issued client ID");

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { accept: "application/json" },
    body: new URLSearchParams({ grant_type: "authorization_code", client_id: clientId, code, code_verifier: p.verifier, redirect_uri: p.redirectUri, resource: RESOURCE }),
  });
  if (!res.ok) throw new Error(`Token exchange failed (${res.status}). Start sign-in again.`);
  const t = (await res.json()) as any;
  for (const f of ["access_token", "refresh_token", "id_token", "scope"]) if (typeof t[f] !== "string" || !t[f]) throw new Error(`Token response missing ${f}`);
  if (!(t.expires_in > 0)) throw new Error("Token response missing expires_in");

  const { issuer, jwks_uri } = await oidc();
  const jwks = (await (await fetch(jwks_uri)).json()) as Jwks;
  const claims = await verifyIdToken(t.id_token, { jwks, issuer, clientId, nonce: p.nonce });

  const scopes: string[] = t.scope.split(/\s+/).filter(Boolean);
  if (!scopes.includes(PLAN_SCOPE)) throw new Error("ChatGPT plan use wasn't granted. Sign in again and allow it.");

  // A reused registration belongs to one account: signing in as someone else with it is refused.
  const account = accountKey(claims);
  if (p.hint && tenantId(account) !== p.hint) throw Object.assign(new Error("You signed in with a different ChatGPT account than this browser used before. Try again."), { switched: true });
  if (p.legacy && p.legacy.email?.trim().toLowerCase() !== account) throw new Error(`This OpenLeo is still set up for ${p.legacy.email ?? "another account"}. Sign in once with that account to finish setting it up.`);

  const cred = { type: "oauth", access: t.access_token, refresh: t.refresh_token, expires: Date.now() + t.expires_in * 1000 - EXPIRY_MARGIN_MS, clientId, scopes };
  return { account, sub: claims.sub, email: claims.email, next: p.next, clientId, idToken: t.id_token, cred, hint: p.hint, legacy: p.legacy };
}

/** Keep an admitted account's tokens (vault) and registration; the old shared registration moves into it. */
async function store(s: SignIn) {
  const tenant = tenantId(s.account);
  const creds = tenantCredentials(tenant);
  const previous = (await creds.read("openai")) as any;
  await vaultSet(tenant, "pi/openai", JSON.stringify(s.cred)); // always this account's vault, never the shared pi login
  // Signed in through a new registration (e.g. after a rename): end the old connection's access.
  if (previous?.type === "oauth" && previous.clientId !== s.clientId) void revoke(previous);
  await writePrivate(regFile(tenant), JSON.stringify({ client_id: s.clientId, sub: s.sub, email: s.email, id_token: s.idToken, app_name: APP_NAME } satisfies Registration, null, 2));
  if (s.legacy) {
    await rm(LEGACY_REG, { force: true });
    await piAuth.delete("openai"); // the shared copy of these tokens
  }
}

/** `admit` throws if the account may not sign in, else returns its session cookies; `forget` clears a stale hint. */
export async function handleCallback(url: URL, admit: (account: string, email?: string) => Promise<string[]>, forget: () => string) {
  const to = (path: string, cookies: string[] = []) => {
    const headers = new Headers({ location: path, "cache-control": "no-store" });
    for (const c of cookies) headers.append("set-cookie", c);
    return new Response(null, { status: 302, headers });
  };
  try {
    const signIn = await finishLogin(url);
    const cookies = await admit(signIn.account, signIn.email);
    await store(signIn);
    return to(signIn.next, cookies);
  } catch (e) {
    const msg = (e as Error).message;
    console.warn(`sign-in failed: ${msg}`);
    if (!(e as any).stray) lastError = msg; // forged/stale callbacks must not change app state
    return to(`/login?error=${encodeURIComponent(msg)}`, (e as any).switched ? [forget()] : []);
  }
}

export async function status(tenant: string) {
  const cred = await tenantCredentials(tenant).read("openai");
  const reg = await readReg(tenant);
  return { signedIn: cred?.type === "oauth", email: reg?.email, pending: pending.size > 0, error: lastError };
}

/** Retries server errors; true when the revocation was confirmed. */
async function revoke(cred: { refresh: string; clientId: string }) {
  for (let i = 0; i < 3; i++) {
    try {
      const { revocation_endpoint } = await oidc();
      const res = await fetch(revocation_endpoint, {
        method: "POST",
        body: new URLSearchParams({ token: cred.refresh, token_type_hint: "refresh_token", client_id: cred.clientId }),
      });
      if (res.ok) return true;
      if (res.status < 500) return false;
    } catch {}
    await Bun.sleep(500 * 2 ** i);
  }
  return false;
}

export async function logout(tenant: string) {
  const creds = tenantCredentials(tenant);
  const cred = (await creds.read("openai")) as any;
  let revoked = true;
  if (cred?.type === "oauth") {
    revoked = await revoke(cred);
    await creds.delete("openai");
  }
  const reg = await readReg(tenant);
  if (reg?.id_token) await writePrivate(regFile(tenant), JSON.stringify({ ...reg, id_token: undefined }, null, 2));
  return { ...(await status(tenant)), revoked };
}
