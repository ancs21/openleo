// Shared route helpers: JSON errors, sign-in and same-origin checks, account and board scoping, input checks.
import { BOARD_ID, hasBoard, MAIN_BOARD } from "../app/boards";
import { LimitError } from "../infra/limits";
import { inBoard } from "../infra/sandbox";
import { SANDBOXED } from "../infra/config";
import { sameOrigin, sessionOf } from "../infra/sessions";
import { fromOwnersDevice } from "../infra/tailnet";
import { inTenant, ownerTenant, tenantId } from "../infra/tenant";
import { allowAttempt, visitorIp } from "./rate-limit";

export const CONVERSATION = /^[\w-]{1,64}$/;

export const err = (e: unknown, status = 400) => Response.json({ error: (e as Error).message }, { status });

/** Thrown errors become `{ error }` JSON with `status` (429 for a reached limit). */
export const safe = <R extends Request>(handler: (req: R) => Response | Promise<Response>, status = 400) =>
  async (req: R) => { try { return await handler(req); } catch (e) { return err(e, e instanceof LimitError ? 429 : status); } };

/** Routes anyone may call; the desktop relay is checked by the computer's ticket. Page files are public too. */
const PUBLIC = new Set(["/api/me", "/api/auth/config", "/api/auth/chatgpt/login", "/auth/callback", "/sbproxy/*"]);
const METHODS = /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/;
type Handler = (req: any, server: any) => Response | Promise<Response>;

export function limited(handler: (req: Request) => Response | Promise<Response>): Handler {
  return async (req, srv) => {
    if (!allowAttempt(visitorIp(req, srv))) return err(new Error("Too many sign-in attempts. Wait a few minutes and try again."), 429);
    try { return await handler(req); } catch (e) { return err(e, 500); }
  };
}

/** The account a request runs as: its signed-in session, or the owner on one of their own devices (Tailscale vouches). */
export function requestTenant(req: Request) {
  const session = sessionOf(req);
  if (session) return tenantId(session.account);
  return fromOwnersDevice(req) ? ownerTenant() : undefined;
}

/** All but PUBLIC need a session and run as its tenant; changes must come from OpenLeo's own pages. */
export function protect<P extends string>(routes: Bun.Serve.Routes<undefined, P>): Bun.Serve.Routes<undefined, P> {
  const guard = (h: Handler): Handler => (req, srv) => {
    const tenant = requestTenant(req);
    if (!tenant) return err(new Error("sign in first"), 401);
    if (!sameOrigin(req)) return err(new Error("cross-site request refused"), 403);
    return inTenant(tenant, () => h(req, srv));
  };
  return Object.fromEntries(Object.entries(routes).map(([path, h]) => {
    if (PUBLIC.has(path)) return [path, h];
    if (typeof h === "function") return [path, guard(h as Handler)];
    const methods = h && typeof h === "object" ? Object.keys(h) : [];
    if (methods.length && methods.every((m) => METHODS.test(m))) {
      return [path, Object.fromEntries(Object.entries(h as Record<string, Handler>).map(([m, fn]) => [m, guard(fn)]))];
    }
    return [path, h]; // HTML bundles: the app shell, which then asks /api/me
  })) as Bun.Serve.Routes<undefined, P>;
}

export function boardParam(bid: string | null | undefined) {
  const b = bid || MAIN_BOARD;
  if (!BOARD_ID.test(b) || !hasBoard(b)) throw new Error(`no board "${b}"`);
  return b;
}

export const onBoard = <R extends Request & { params: { board: string } }>(handler: (req: R) => Response | Promise<Response>) =>
  (req: R) => inBoard(boardParam(req.params.board), () => handler(req));

export async function inComputer<T>(board: string, fn: () => Promise<T>) {
  const bid = boardParam(board);
  if (!SANDBOXED) throw new Error("notes live in the board's computer, and computers are off (OPENLEO_SANDBOX=off)");
  return Response.json(await inBoard(bid, fn));
}

/** Images arrive as data: URLs; cap count and size. */
export function parseImages(v: unknown) {
  if (!Array.isArray(v)) return [];
  if (v.length > 8) throw new Error("at most 8 images");
  return v.map((u) => {
    const m = typeof u === "string" && /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(u);
    if (!m || m[2]!.length > 2_000_000) throw new Error("images must be base64 jpeg/png/webp data URLs under ~1.5MB");
    return { type: "image" as const, mimeType: m[1]!, data: m[2]! };
  });
}
