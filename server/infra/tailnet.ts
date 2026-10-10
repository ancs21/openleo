// Open OpenLeo on your other devices over Tailscale: HTTPS on this computer's Tailscale address, and Tailscale
// vouches for who each visitor is, so the owner's own devices come straight in.
import { existsSync, mkdirSync } from "node:fs";
import { HOME } from "./config";
import { writePrivate } from "./private-file";

export type TailnetStatus = {
  installed: boolean;
  running: boolean;
  /** The network has HTTPS certificates turned on (needed for the address). */
  https?: boolean;
  /** Set only while shared. */
  address?: string;
  shared: boolean;
};

export const HTTPS_SETTINGS = "https://login.tailscale.com/admin/dns";

// The command-line tool: on PATH, or inside the Mac app (which doesn't always add it to PATH).
const MAC_APP_CLI = "/Applications/Tailscale.app/Contents/MacOS/Tailscale";
const cli = () => Bun.which("tailscale") ?? (existsSync(MAC_APP_CLI) ? MAC_APP_CLI : undefined);

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

export type Self = { host: string; ips: string[]; login: string; https: boolean };
export async function self(): Promise<Self | undefined> {
  const s = json(await run(["status", "--json"]));
  const host = typeof s?.Self?.DNSName === "string" ? s.Self.DNSName.replace(/\.$/, "") : "";
  const login = s?.User?.[String(s?.Self?.UserID)]?.LoginName;
  if (s?.BackendState !== "Running" || !host || typeof login !== "string") return undefined;
  return { host, ips: s.Self.TailscaleIPs ?? [], login, https: Array.isArray(s.CertDomains) && s.CertDomains.length > 0 };
}

export async function issueCert(host: string) {
  const dir = `${HOME}/tailnet`;
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const files = { cert: `${dir}/cert.pem`, key: `${dir}/key.pem` };
  if ((await run(["cert", "--cert-file", files.cert, "--key-file", files.key, host], 60_000)) === undefined) {
    throw new Error("Tailscale couldn't make a certificate for this computer. Check that HTTPS Certificates are on, then try again.");
  }
  return files;
}

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

export async function tailnetStatus(address?: string): Promise<TailnetStatus> {
  if (!cli()) return { installed: false, running: false, shared: false };
  const me = await self();
  if (!me) return { installed: true, running: false, shared: false };
  return { installed: true, running: true, https: me.https, address, shared: !!address };
}

// Visits on the Tailscale address and the account Tailscale named (undefined if it couldn't, or this computer itself).
const visitors = new WeakMap<Request, string | undefined>();
let owner: { login: string; origin: string } | undefined;

/** Called by the Tailscale listener while it runs: its address, and whose devices count as the owner's. */
export const setListening = (to?: { login: string; origin: string }) => { owner = to; };
export const noteVisitor = (req: Request, login: string | undefined) => visitors.set(req, login);

/** The Tailscale address, while OpenLeo is shared there: pages on it may use OpenLeo too. */
export const tailnetOrigin = () => owner?.origin;
export const viaTailnet = (req: Request) => visitors.has(req);
/** From a device of the Tailscale account this computer is signed in with. */
export const fromOwnersDevice = (req: Request) => !!owner && visitors.get(req) === owner.login;
