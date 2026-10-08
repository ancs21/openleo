// A board's computer: its state, starting it, files agents linked in replies, the live screen and desktop viewer.
import { HOST, isLoopback, PUBLIC_URL, SANDBOXED } from "../infra/config";
import { computerSetup, setupStep } from "../app/computers";
import { saveToDownloads } from "../infra/downloads";
import { computerState, inBoard, sandbox, SANDBOX_ON, sbReadBytes, sbScreenshot, sbViewerUrl } from "../infra/sandbox";
import { tailnetOrigin, viaTailnet } from "../infra/tailnet";
import { currentTenant, isOwner } from "../infra/tenant";
import { boardParam, err, safe } from "./guard";

let viewerOrigin: string | null = null; // cua-spacesd viewer origin, learned when a viewer link is minted

/** A relayed live connection: the browser's side here, the computer's side in `up`. */
type ViewerSocket = { target: string; protocol?: string; up?: WebSocket; queue: (string | Uint8Array<ArrayBuffer>)[] };
/** Pass the viewer's live connection both ways between the browser and the computer. Both servers use it. */
const relaySocket: Bun.WebSocketHandler<ViewerSocket> = {
  open(ws) {
    const up = new WebSocket(ws.data.target, ws.data.protocol ? [ws.data.protocol] : []);
    up.binaryType = "arraybuffer";
    ws.data.up = up;
    up.onopen = () => { for (const m of ws.data.queue.splice(0)) up.send(m); };
    up.onmessage = (e) => ws.send(e.data as string | ArrayBuffer);
    up.onclose = () => ws.close();
    up.onerror = () => ws.close();
  },
  message(ws, msg) { const m = typeof msg === "string" ? msg : new Uint8Array(msg) as Uint8Array<ArrayBuffer>; if (ws.data.up?.readyState === WebSocket.OPEN) ws.data.up.send(m); else ws.data.queue.push(m); },
  close(ws) { ws.data.up?.close(); },
};
// The servers' routes carry no socket data of their own; this is the only kind of socket they open.
export const viewerSocket = relaySocket as unknown as Bun.WebSocketHandler<undefined>;

/** This Mac's owner, using it on this Mac: not over the network, and not from another device through Tailscale. */
export const onThisMac = (req: Request) => HOST === "127.0.0.1" && !viaTailnet(req) && isOwner(currentTenant());
/** Setup runs commands on this Mac, so only from this Mac. */
const canSetUp = onThisMac;

export const computerRoutes = {
  // Getting a computer for agents on this Mac (the onboarding the app shows when there's none yet).
  "/api/setup": {
    GET: safe(async (req) => {
      const setup = await computerSetup();
      return Response.json(canSetUp(req) ? { ...setup, manage: true } : { ready: setup.ready, runtime: setup.runtime, manage: false });
    }, 500),
  },
  "/api/setup/:step": {
    POST: safe(async (req: Bun.BunRequest<"/api/setup/:step">) => {
      if (!canSetUp(req)) throw new Error("only the owner of this Mac can set up its computer, on this Mac");
      await setupStep(req.params.step);
      return Response.json({ ...(await computerSetup()), manage: true });
    }),
  },
  // A file in the board's computer that an agent linked in its reply, so the app can show it.
  // Served as a sandboxed download-safe response: an SVG or HTML file can't run script on OpenLeo's origin.
  "/api/boards/:board/computer/file": {
    GET: safe(async (req: Bun.BunRequest<"/api/boards/:board/computer/file">) => {
      const bid = boardParam(req.params.board);
      const path = new URL(req.url).searchParams.get("path") ?? "";
      if (!SANDBOXED) throw new Error("computers are off (OPENLEO_SANDBOX=off)");
      if (!path.startsWith("/") || path.includes("\0") || path.split("/").includes("..")) throw new Error("bad path");
      const bytes = await inBoard(bid, () => sbReadBytes(path));
      const type = Bun.file(path).type.replace(/^text\/html.*/, "text/plain;charset=utf-8"); // by extension; HTML shows as text
      return new Response(bytes, { headers: {
        "content-type": type, "x-content-type-options": "nosniff", "content-security-policy": "sandbox; default-src 'none'; img-src data:; style-src 'unsafe-inline'",
        "content-disposition": `inline; filename="${encodeURIComponent(path.split("/").pop() || "file")}"`, "cache-control": "private, max-age=60",
      } });
    }, 404),
  },
  // The Mac app's web view can't download: there, a file is saved to this Mac's Downloads folder and shown in Finder.
  // Only for the owner of an OpenLeo that runs on this Mac (not one reached over the network).
  "/api/boards/:board/computer/file/save": {
    POST: safe(async (req: Bun.BunRequest<"/api/boards/:board/computer/file/save">) => {
      const bid = boardParam(req.params.board);
      if (!onThisMac(req)) throw new Error("download it from your browser instead");
      const path = String(((await req.json()) as any).path ?? "");
      if (!SANDBOXED || !path.startsWith("/") || path.split("/").includes("..")) throw new Error("bad path");
      const bytes = await inBoard(bid, () => sbReadBytes(path));
      return Response.json({ saved: await saveToDownloads(path.split("/").pop() || "file", bytes) });
    }),
  },
  "/api/boards/:board/computer": {
    GET: safe((req: Bun.BunRequest<"/api/boards/:board/computer">) => Response.json(computerState(boardParam(req.params.board))), 404),
    // Start (or retry) the computer.
    POST: safe(async (req: Bun.BunRequest<"/api/boards/:board/computer">) => {
      const bid = boardParam(req.params.board);
      if (!SANDBOXED) throw new Error("sandbox is off");
      await sandbox(bid).catch(() => {});
      return Response.json(computerState(bid));
    }, 503),
  },
  "/api/sandbox": { GET: () => Response.json({ sandboxed: SANDBOXED, on: SANDBOX_ON }) },
  // Live frame for the Agent Screen card/dock (polled by the UI). ?board= picks the board's computer.
  "/api/sandbox/screen": safe(async (req) => {
    if (!SANDBOXED) return err(new Error("sandbox is off"), 404);
    const bid = boardParam(new URL(req.url).searchParams.get("board"));
    const shot = await inBoard(bid, () => sbScreenshot());
    return new Response(shot.image, { headers: { "content-type": "image/jpeg", "cache-control": "no-store" } });
  }, 503),
  "/api/sandbox/viewer": {
    POST: safe(async (req) => {
      if (!SANDBOXED) return err(new Error("sandbox is off"), 404);
      // The viewer connects the browser straight to the computer, and local computers only listen on the server:
      // from another device through Tailscale it goes through OpenLeo instead (/sbproxy/).
      const relay = viaTailnet(req) && SANDBOX_ON !== "cloud";
      if (!relay && !isLoopback(PUBLIC_URL.hostname) && SANDBOX_ON !== "cloud") {
        return err(new Error("The live desktop isn't available on a hosted OpenLeo with local computers. Ask the operator to use cloud computers (OPENLEO_SANDBOX_ON=cloud)."), 503);
      }
      const bid = boardParam(new URL(req.url).searchParams.get("board"));
      const url = new URL(await inBoard(bid, () => sbViewerUrl()));
      viewerOrigin = url.origin;
      // Same viewer, served from our origin so it can be framed; it talks to the computer via `base`.
      const base = relay ? `${tailnetOrigin()}/sbproxy/` : `${url.origin}/`;
      const embed = `/sbviewer/${url.hash}&base=${encodeURIComponent(base)}`;
      return Response.json({ url: relay ? `${tailnetOrigin()}${embed}` : url.toString(), embed });
    }, 503),
  },
  // The viewer's requests and live connection, relayed to the computer for another device (Tailscale). Public like the
  // computer itself: the viewer sends no cookies, and the computer checks the viewer's ticket on every request.
  "/sbproxy/*": async (req: Request, srv: Bun.Server<undefined>) => {
    if (!viewerOrigin) return err(new Error("open the viewer first"), 409);
    const u = new URL(req.url);
    const rel = u.pathname.slice("/sbproxy/".length);
    if (rel.split("/").some((seg) => seg === ".." || seg.startsWith("."))) return err(new Error("bad path"), 400);
    const target = `${viewerOrigin}/${rel}${u.search}`;
    if (req.headers.get("upgrade")?.toLowerCase() === "websocket") {
      const protocol = req.headers.get("sec-websocket-protocol")?.split(",")[0]?.trim();
      const data: ViewerSocket = { target: target.replace(/^http/, "ws"), protocol, queue: [] };
      if ((srv as unknown as Bun.Server<ViewerSocket>).upgrade(req, { data, headers: protocol ? { "Sec-WebSocket-Protocol": protocol } : undefined })) return undefined as unknown as Response;
      return err(new Error("couldn't connect"), 400);
    }
    const headers = new Headers(req.headers);
    for (const k of ["host", "cookie", "origin", "referer"]) headers.delete(k);
    const up = await fetch(target, { method: req.method, headers, body: req.method === "GET" || req.method === "HEAD" ? undefined : req.body, redirect: "manual" });
    const h = new Headers(up.headers);
    for (const k of ["content-encoding", "content-length"]) h.delete(k);
    return new Response(up.body, { status: up.status, headers: h });
  },
  // Static files of cua's viewer, minus its frame-ancestors/COOP headers. Only GETs under /viewer/.
  "/sbviewer/*": async (req: Request) => {
    if (!viewerOrigin) return err(new Error("open the viewer first"), 409);
    const rel = new URL(req.url).pathname.slice("/sbviewer/".length);
    if (rel.split("/").some((seg) => seg === ".." || seg.startsWith("."))) return err(new Error("bad path"), 400);
    const up = await fetch(`${viewerOrigin}/viewer/${rel}`);
    const h = new Headers(up.headers);
    for (const k of ["content-security-policy", "x-frame-options", "cross-origin-opener-policy", "content-encoding", "content-length"]) h.delete(k);
    return new Response(up.body, { status: up.status, headers: h });
  },
};
