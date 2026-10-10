// Site icons for web sources, fetched from the site itself once and cached on disk, so the browser
// only talks to OpenLeo (no third-party icon service). Misses are cached too, as an empty file, for a day.
import { HOME } from "./config";

const DIR = `${HOME}/cache/site-icons`;
const MAX_BYTES = 200_000;
const MAX_PAGE = 500_000;
const MISS_TTL = 24 * 3600_000;
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";

type Icon = { bytes: Uint8Array; type: string };

/** Public DNS names only: no IPs, no localhost or single-label hosts (keeps the fetch off the local network). */
export const isPublicHost = (host: string) =>
  /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(host) && !/(^|\.)(localhost|local|internal|lan|home|test)$/.test(host);

const get = (url: string, fetchImpl: typeof fetch) =>
  fetchImpl(url, { redirect: "follow", headers: { "user-agent": UA }, signal: AbortSignal.timeout(5_000) });

/** Declared icons, best first: apple-touch-icon, then largest (SVG counts as large). Only https on public hosts. */
export function iconLinks(html: string, base: string): string[] {
  const found: { url: string; score: number }[] = [];
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    const attr = (name: string) => tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"))?.slice(1).find((v) => v !== undefined);
    const rel = attr("rel")?.toLowerCase() ?? "";
    const href = attr("href");
    if (!href || !/\b(icon|apple-touch-icon(-precomposed)?)\b/.test(rel) || /mask-icon/.test(rel)) continue;
    let url: URL;
    try { url = new URL(href.replace(/&amp;/g, "&"), base); } catch { continue; }
    if (url.protocol !== "https:" || !isPublicHost(url.hostname)) continue;
    const size = Math.max(0, ...(attr("sizes")?.match(/\d+/g) ?? []).map(Number));
    const svg = /\.svg(\?|$)/i.test(url.pathname) || /svg/.test(attr("type") ?? "");
    found.push({ url: url.href, score: (/apple-touch/.test(rel) ? 1000 : 0) + (svg ? 512 : size || 16) });
  }
  return [...new Set(found.sort((a, b) => b.score - a.score).map((f) => f.url))];
}

async function fetchImage(url: string, fetchImpl: typeof fetch): Promise<Icon | null> {
  try {
    const res = await get(url, fetchImpl);
    const type = (res.headers.get("content-type") ?? "").split(";")[0]!.trim();
    if (!res.ok || !/^image\//.test(type)) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    return bytes.length && bytes.length <= MAX_BYTES ? { bytes, type } : null;
  } catch {
    return null;
  }
}

export async function fetchIcon(host: string, fetchImpl: typeof fetch = fetch): Promise<Icon | null> {
  try {
    const res = await get(`https://${host}/`, fetchImpl);
    if (res.ok && /html/.test(res.headers.get("content-type") ?? "")) {
      const html = (await res.text()).slice(0, MAX_PAGE);
      for (const url of iconLinks(html, res.url || `https://${host}/`).slice(0, 4)) {
        const icon = await fetchImage(url, fetchImpl);
        if (icon) return icon;
      }
    }
  } catch {}
  return fetchImage(`https://${host}/favicon.ico`, fetchImpl);
}

/** Null when the site has none (the UI shows a letter avatar). */
export async function favicon(host: string): Promise<Icon | null> {
  if (!isPublicHost(host)) return null;
  const file = Bun.file(`${DIR}/${host}`);
  const meta = Bun.file(`${DIR}/${host}.type`);
  if (await file.exists() && (file.size || Date.now() - file.lastModified < MISS_TTL)) {
    return file.size ? { bytes: await file.bytes(), type: await meta.text() } : null;
  }
  const icon = await fetchIcon(host);
  await Bun.write(file, icon?.bytes ?? "");
  if (icon) await Bun.write(meta, icon.type);
  return icon;
}
