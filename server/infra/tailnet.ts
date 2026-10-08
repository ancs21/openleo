// Opening OpenLeo on your other devices through Tailscale, a private network of your own devices. OpenLeo serves
// HTTPS on this computer's Tailscale address (with a certificate from Tailscale) and asks Tailscale who each visitor
// is. Tailscale vouches for that, so the owner's own devices come straight in, and nothing else can pretend to be them.
import { existsSync, mkdirSync } from "node:fs";
import { HOME } from "./config";
import { writePrivate } from "./private-file";

export type TailnetStatus = {
  /** Tailscale is installed here. */
  installed: boolean;
  /** Signed in and connected. */
  running: boolean;
  /** The network has HTTPS certificates turned on (needed for the address). */
  https?: boolean;
  /** OpenLeo's address on the Tailscale network, e.g. https://my-mac.tail1234.ts.net, while it's shared. */
  address?: string;
  /** OpenLeo is open to your Tailscale devices. */
  shared: boolean;
};

/** Where the network's owner turns on HTTPS certificates. */
export const HTTPS_SETTINGS = "https://login.tailscale.com/admin/dns";

// The command-line tool: on PATH, or inside the Mac app (which doesn't always add it to PATH).
const MAC_APP_CLI = "/Applications/Tailscale.app/Contents/MacOS/Tailscale";
const cli = () => Bun.which("tailscale") ?? (existsSync(MAC_APP_CLI) ? MAC_APP_CLI : undefined);

/** Run the tool; its output when it worked, else undefined. */
async function run(args: string[], timeoutMs = 10_000) {
  const bin = cli();
  if (!bin) return undefined;
  try {
    const p = Bun.spawn([bin, ...args], { stdout: "pipe", stderr: "pipe" });
    const timer = setTimeout(() => p.kill(), timeoutMs);
    const [out, code] = await Promise.all([new Response(p.stdout).text(), p.exited]);
    clearTimeout(timer);
    return code === 0 ? out.trim() : undefined;
  } catch { return undefined; }
}
const json = (text: string | undefined) => { try { return text ? JSON.parse(text) : undefined; } catch { return undefined; } };

/** This computer on the Tailscale network: its name, addresses and the account it's signed in to. */
export type Self = { host: string; ips: string[]; login: string; https: boolean };
export async function self(): Promise<Self | undefined> {
  const s = json(await run(["status", "--json"]));
  const host = typeof s?.Self?.DNSName === "string" ? s.Self.DNSName.replace(/\.$/, "") : "";
  const login = s?.User?.[String(s?.Self?.UserID)]?.LoginName;
  if (s?.BackendState !== "Running" || !host || typeof login !== "string") return undefined;
  return { host, ips: s.Self.TailscaleIPs ?? [], login, https: Array.isArray(s.CertDomains) && s.CertDomains.length > 0 };
}

/** Get (or renew) this computer's HTTPS certificate from Tailscale, into OpenLeo's data folder. */
export async function issueCert(host: string) {
  const dir = `${HOME}/tailnet`;
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const files = { cert: `${dir}/cert.pem`, key: `${dir}/key.pem` };
  if ((await run(["cert", "--cert-file", files.cert, "--key-file", files.key, host], 60_000)) === undefined) {
    throw new Error("Tailscale couldn't make a certificate for this computer. Check that HTTPS Certificates are on, then try again.");
  }
  return files;
}

// Who each Tailscale address belongs to, asked of Tailscale and kept for a minute.
const known = new Map<string, { login?: string; at: number }>();
export async function whois(ip: string) {
  const hit = known.get(ip);
  if (hit && Date.now() - hit.at < 60_000) return hit.login;
  const login = json(await run(["whois", "--json", ip]))?.UserProfile?.LoginName;
  known.set(ip, { login: typeof login === "string" ? login : undefined, at: Date.now() });
  return known.get(ip)!.login;
}

// Whether the owner turned sharing on, kept across restarts.
const STATE = `${HOME}/tailnet.json`;
export const wantShared = async () => !!(json(await Bun.file(STATE).text().catch(() => undefined))?.on);
export const saveShared = (on: boolean) => writePrivate(STATE, JSON.stringify({ on }));

/** Is Tailscale here, signed in, with HTTPS on: what the owner sees before turning sharing on. */
export async function tailnetStatus(address?: string): Promise<TailnetStatus> {
  if (!cli()) return { installed: false, running: false, shared: false };
  const me = await self();
  if (!me) return { installed: true, running: false, shared: false };
  return { installed: true, running: true, https: me.https, address, shared: !!address };
}

// Visits that arrived on the Tailscale address, with the account Tailscale says they're from (none: someone the
// owner shared their network with but Tailscale couldn't name, or this computer itself).
const visitors = new WeakMap<Request, string | undefined>();
let owner: { login: string; origin: string } | undefined;

/** Called by the Tailscale listener while it runs: its address, and whose devices count as the owner's. */
export const setListening = (to?: { login: string; origin: string }) => { owner = to; };
export const noteVisitor = (req: Request, login: string | undefined) => visitors.set(req, login);

/** The Tailscale address, while OpenLeo is shared there: pages on it may use OpenLeo too. */
export const tailnetOrigin = () => owner?.origin;
/** This visit came from another device through Tailscale, not from this computer. */
export const viaTailnet = (req: Request) => visitors.has(req);
/** It came from one of the devices of the account this computer is signed in to Tailscale with: its owner. */
export const fromOwnersDevice = (req: Request) => !!owner && visitors.get(req) === owner.login;
