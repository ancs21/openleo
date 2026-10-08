// Every OpenLeo setting, in one place. Read from the environment for now; all optional, defaults shown.
const env = process.env;
const num = (name: string, fallback: number) => (Number(env[name]) > 0 ? Number(env[name]) : fallback);

/** Where data lives (accounts, the vault, sign-in sessions, caches); `data/` next to the code by default. */
export const HOME = env.OPENLEO_HOME ?? "data";

// Board computers (infra/sandbox.ts, infra/apple-container.ts).
/** "off" runs tools on this machine instead (then only the owner can sign in). */
export const SANDBOXED = env.OPENLEO_SANDBOX !== "off";
/** apple, local (Docker) or cloud; unset picks apple when this Mac can, else Docker. */
export const SANDBOX_ON_SETTING = env.OPENLEO_SANDBOX_ON;
/** The computer image in Docker: OpenLeo's own (computer/), built on this Mac by setup. Set: this image everywhere. */
export const DOCKER_IMAGE = env.OPENLEO_SANDBOX_IMAGE ?? "openleo-computer";
/** Cloud computers can't use an image built here: the stock desktop from its registry. */
export const CLOUD_IMAGE = env.OPENLEO_SANDBOX_IMAGE ?? "ghcr.io/trycua/linux:24.04-slim";
export const APPLE_IMAGE = env.OPENLEO_APPLE_IMAGE ?? "openleo-computer";
/** OpenLeo's computer, ready made for both chips (.github/workflows/computer.yml): setup pulls it instead of building. */
export const PUBLISHED_IMAGE = "ghcr.io/ancs21/openleo-computer:latest";
// The runtime's built-in DNS (the network gateway) refuses lookups on some Macs; a public resolver always works.
export const APPLE_DNS = env.OPENLEO_APPLE_DNS ?? "1.1.1.1";

/** Per-account limits, so one account can't use up this machine. The install owner has none. */
export const LIMITS = {
  boards: num("OPENLEO_MAX_BOARDS", 3), // each board is an always-on computer
  runs: num("OPENLEO_MAX_RUNS", 3), // agent runs at the same time
  storageMb: num("OPENLEO_MAX_STORAGE_MB", 1024), // the account's folder: agents, chats, boards, files
  computerCpus: num("OPENLEO_COMPUTER_CPUS", 2), // per board computer
  computerMemoryMb: num("OPENLEO_COMPUTER_MEMORY_MB", 4096),
};

/** Search all of Unsplash for wallpapers; without it, the built-in photos. */
export const UNSPLASH_KEY = env.UNSPLASH_ACCESS_KEY;
/** OAuth client registered with OpenAI, for sign-in on a public address. */
export const CHATGPT_CLIENT_ID = env.OPENLEO_CHATGPT_CLIENT_ID;

// Where OpenLeo listens and the address people use to reach it.
// Local by default: http://127.0.0.1:3000, reachable only from this machine. To host it for others, put it
// behind HTTPS and tell it the public address:
//   OPENLEO_PUBLIC_URL=https://openleo.example   the address in the browser (sign-in returns here)
//   OPENLEO_HOST=0.0.0.0                         listen beyond this machine (needs HTTPS, see below)
//   OPENLEO_TLS_CERT / OPENLEO_TLS_KEY           serve HTTPS directly, or use a reverse proxy that does
//   OPENLEO_TRUST_PROXY=1                        take the visitor's IP from X-Forwarded-For (behind a proxy)
export const PORT = Number(env.PORT ?? 3000);
export const HOST = env.OPENLEO_HOST ?? "127.0.0.1";
export const PUBLIC_URL = new URL(env.OPENLEO_PUBLIC_URL ?? `http://127.0.0.1:${PORT}`);
export const PUBLIC_ORIGIN = PUBLIC_URL.origin;
export const TRUST_PROXY = env.OPENLEO_TRUST_PROXY === "1";
export const TLS = env.OPENLEO_TLS_CERT && env.OPENLEO_TLS_KEY
  ? { cert: Bun.file(env.OPENLEO_TLS_CERT), key: Bun.file(env.OPENLEO_TLS_KEY) }
  : undefined;

export const isLoopback = (host: string) => host === "localhost" || host === "::1" || host === "[::1]" || host.startsWith("127.");

/**
 * Refuse unsafe exposure: listening beyond this machine needs HTTPS (directly or via a proxy), because
 * session cookies and ChatGPT tokens would otherwise cross the network in the clear.
 */
export function exposureProblem(host = HOST, publicUrl = PUBLIC_URL, tls = !!TLS, behindProxy = TRUST_PROXY): string | undefined {
  if (isLoopback(host)) return undefined;
  if (publicUrl.protocol !== "https:") return `OPENLEO_HOST=${host} exposes OpenLeo to the network: set OPENLEO_PUBLIC_URL to its https:// address (and serve HTTPS with OPENLEO_TLS_CERT/KEY or a reverse proxy).`;
  if (!tls && !behindProxy) return "Serving beyond this machine without TLS: set OPENLEO_TLS_CERT/KEY, or OPENLEO_TRUST_PROXY=1 when an HTTPS reverse proxy is in front.";
  return undefined;
}
