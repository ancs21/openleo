// Every OpenLeo setting, in one place. Read from the environment for now; all optional, defaults shown.
const env = process.env;
const num = (name: string, fallback: number) => (Number(env[name]) > 0 ? Number(env[name]) : fallback);

/** Where data lives (accounts, the vault, sign-in sessions, caches); `data/` next to the code by default. */
export const HOME = env.OPENLEO_HOME ?? "data";

/** "off" runs tools on this machine instead (then only the owner can sign in). */
export const SANDBOXED = env.OPENLEO_SANDBOX !== "off";
export const SANDBOX_ON_SETTING = env.OPENLEO_SANDBOX_ON;
/** OpenLeo's computer image in Docker; when set, used everywhere. */
export const DOCKER_IMAGE = env.OPENLEO_SANDBOX_IMAGE ?? "openleo-computer";
/** Cloud computers can't use a locally built image. */
export const CLOUD_IMAGE = env.OPENLEO_SANDBOX_IMAGE ?? "ghcr.io/trycua/linux:24.04-slim";
export const APPLE_IMAGE = env.OPENLEO_APPLE_IMAGE ?? "openleo-computer";
/** Built for both chips by CI; setup pulls it instead of building. */
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

// Local only by default (127.0.0.1:3000). To host for others: OPENLEO_PUBLIC_URL (https address, sign-in returns
// there), OPENLEO_HOST=0.0.0.0, OPENLEO_TLS_CERT/KEY or a reverse proxy with OPENLEO_TRUST_PROXY=1 (X-Forwarded-For).
export const PORT = Number(env.PORT ?? 3000);
export const HOST = env.OPENLEO_HOST ?? "127.0.0.1";
export const PUBLIC_URL = new URL(env.OPENLEO_PUBLIC_URL ?? `http://127.0.0.1:${PORT}`);
export const PUBLIC_ORIGIN = PUBLIC_URL.origin;
export const TRUST_PROXY = env.OPENLEO_TRUST_PROXY === "1";
export const TLS = env.OPENLEO_TLS_CERT && env.OPENLEO_TLS_KEY
  ? { cert: Bun.file(env.OPENLEO_TLS_CERT), key: Bun.file(env.OPENLEO_TLS_KEY) }
  : undefined;

export const isLoopback = (host: string) => host === "localhost" || host === "::1" || host === "[::1]" || host.startsWith("127.");

/** Listening beyond this machine needs HTTPS, or session cookies and tokens cross the network in the clear. */
export function exposureProblem(host = HOST, publicUrl = PUBLIC_URL, tls = !!TLS, behindProxy = TRUST_PROXY): string | undefined {
  if (isLoopback(host)) return undefined;
  if (publicUrl.protocol !== "https:") return `OPENLEO_HOST=${host} exposes OpenLeo to the network: set OPENLEO_PUBLIC_URL to its https:// address (and serve HTTPS with OPENLEO_TLS_CERT/KEY or a reverse proxy).`;
  if (!tls && !behindProxy) return "Serving beyond this machine without TLS: set OPENLEO_TLS_CERT/KEY, or OPENLEO_TRUST_PROXY=1 when an HTTPS reverse proxy is in front.";
  return undefined;
}
