// Opening OpenLeo on your other devices (Tailscale): a second listener on this computer's Tailscale addresses, with
// HTTPS, serving the same routes. Each visit is tagged with the account Tailscale says it's from; the owner's own
// devices are let in as the owner (see guard.ts). Only the owner, on this computer, can turn it on or off.
import { issueCert, noteVisitor, saveShared, self, setListening, tailnetStatus, wantShared, whois } from "../infra/tailnet";
import { onThisMac, viewerSocket } from "./computer";
import { err, safe } from "./guard";

type Routes = Record<string, unknown>;
type Handler = (req: Request, server: Bun.Server<undefined>) => Response | Promise<Response>;

const PORT = 3443;
let routes: Routes = {};
let listeners: Bun.Server<undefined>[] = [];
let address: string | undefined;
let renewal: ReturnType<typeof setInterval> | undefined;

/** The same routes, each first noting who the visit is from. Visits from this computer's own addresses count as no one. */
function identified(all: Routes, own: string[]): Routes {
  const tag = (h: Handler): Handler => async (req, srv) => {
    const ip = (srv.requestIP(req)?.address ?? "").replace(/^::ffff:/, "");
    noteVisitor(req, own.includes(ip) ? undefined : await whois(ip));
    return h(req, srv);
  };
  return Object.fromEntries(Object.entries(all).map(([path, h]) => {
    if (typeof h === "function") return [path, tag(h as Handler)];
    const methods = h && typeof h === "object" ? Object.keys(h) : [];
    if (methods.length && methods.every((m) => /^[A-Z]+$/.test(m))) {
      return [path, Object.fromEntries(Object.entries(h as Record<string, Handler>).map(([m, fn]) => [m, tag(fn)]))];
    }
    return [path, h]; // the app's pages (HTML bundles): public, and they then ask /api/me
  }));
}

function stop() {
  for (const l of listeners) void l.stop(true);
  listeners = [];
  address = undefined;
  clearInterval(renewal);
  setListening(undefined);
}

/** Listen on the Tailscale addresses with a fresh certificate. Port 3443: Tailscale answers 443 on its addresses itself. */
async function start() {
  stop();
  const me = await self();
  if (!me) throw new Error("Open Tailscale on this computer and sign in first.");
  if (!me.https) throw new Error("Turn on HTTPS Certificates in Tailscale's DNS settings first.");
  const files = await issueCert(me.host);
  const tls = { cert: Bun.file(files.cert), key: Bun.file(files.key) };
  const shared = identified(routes, me.ips) as Bun.Serve.Routes<undefined, string>;
  try {
    for (const hostname of me.ips) {
      listeners.push(Bun.serve({ hostname, port: PORT, tls, routes: shared, fetch: () => new Response("Not found", { status: 404 }), idleTimeout: 0, development: false, websocket: viewerSocket }));
    }
  } catch (e) { stop(); throw e; }
  address = `https://${me.host}:${PORT}`;
  setListening({ login: me.login, origin: address! });
  renewal = setInterval(() => void start().catch(() => {}), 24 * 3600_000); // certificates last 90 days; renew early
}

/** At startup: remember the routes, and share again if the owner left it on. */
export async function serveOnTailnet(all: Routes) {
  routes = all;
  if (await wantShared()) await start().catch((e) => console.warn(`Tailscale sharing is on but couldn't start: ${(e as Error).message}`));
}

export const remoteRoutes = {
  "/api/remote": {
    GET: safe(async (req) => (onThisMac(req) ? Response.json({ manage: true, ...(await tailnetStatus(address)) }) : Response.json({ manage: false })), 500),
    POST: safe(async (req) => {
      if (!onThisMac(req)) return err(new Error("only the owner can change this, on the computer that runs OpenLeo"), 403);
      const on = !!((await req.json().catch(() => ({}))) as { on?: boolean }).on;
      if (on) await start(); else stop();
      await saveShared(on);
      return Response.json({ manage: true, ...(await tailnetStatus(address)) });
    }, 502),
  },
};
