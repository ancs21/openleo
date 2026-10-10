// ChatGPT sign-in. Any account may sign in and gets its own tenant on first sign-in.
import { startComputers } from "../app/computers";
import { PUBLIC_ORIGIN, SANDBOXED } from "../infra/config";
import { startMcp } from "../infra/mcp";
import { accountOf, createSession, destroySession, forgetAccount, rememberAccount, sessionOf } from "../infra/sessions";
import * as siwc from "../infra/siwc";
import { fromOwnersDevice, tailnetOrigin } from "../infra/tailnet";
import { currentTenant, ensureTenant, inTenant, isOwner, listTenants, ownerTenant, tenantId } from "../infra/tenant";
import { err, limited } from "./guard";

export const authRoutes = {
  "/api/auth/chatgpt": { GET: async () => Response.json(await siwc.status(currentTenant())) },
  "/api/me": (req: Request) => {
    const s = sessionOf(req);
    if (s) return Response.json({ email: s.email });
    return fromOwnersDevice(req) && ownerTenant() ? Response.json({}) : err(new Error("sign in first"), 401);
  },
  // Public. Cookies are per host, so list every address sign-in may start from.
  "/api/auth/config": () => Response.json({ origin: PUBLIC_ORIGIN, origins: [PUBLIC_ORIGIN, tailnetOrigin()].filter(Boolean) }),
  "/api/auth/chatgpt/login": {
    POST: limited(async (req) => {
      const next = String(((await req.json().catch(() => ({}))) as any).next ?? "/");
      const safeNext = /^\/(?!\/)[^\\]*$/.test(next) && !next.startsWith("/login") ? next : "/"; // same-app paths only
      const hint = accountOf(req);
      const from = req.headers.get("origin") === tailnetOrigin() ? tailnetOrigin()! : PUBLIC_ORIGIN;
      return Response.json(await siwc.startLogin(`${from}/auth/callback`, safeNext, hint && listTenants().includes(hint) ? hint : undefined));
    }),
  },
  // Signing out of ChatGPT ends the browser session too.
  "/api/auth/chatgpt/logout": {
    POST: async (req: Request) => {
      const result = await siwc.logout(currentTenant());
      return Response.json(result, { headers: { "set-cookie": await destroySession(req) } });
    },
  },
  "/auth/callback": limited((req) => siwc.handleCallback(new URL(req.url), async (account, email) => {
    const tenant = tenantId(account);
    // Without the sandbox, tools run directly on this computer: only its owner may use it then.
    if (!SANDBOXED && listTenants().length && !isOwner(tenant)) throw new Error("This OpenLeo runs tools directly on this computer, so only its owner can sign in.");
    if (ensureTenant(tenant)) inTenant(tenant, () => { startComputers(); void startMcp(); });
    return [await createSession(req, account, email), rememberAccount(req, tenant)];
  }, () => forgetAccount(req))),
};
