// Site icons for web sources, fetched from the site itself once and cached on disk, so the browser
// only talks to OpenLeo (no third-party icon service). Misses are cached too, as an empty file.
import { HOME } from "./config";

const DIR = `${HOME}/cache/favicons`; // Bun.write creates it
const MAX_BYTES = 200_000;

/** Public DNS names only: no IPs, no localhost or single-label hosts (keeps the fetch off the local network). */
export const isPublicHost = (host: string) =>
  /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(host) && !/(^|\.)(localhost|local|internal|lan|home|test)$/.test(host);

async function fetchIcon(host: string): Promise<{ bytes: Uint8Array; type: string } | null> {
  try {
    const res = await fetch(`https://${host}/favicon.ico`, { redirect: "follow", signal: AbortSignal.timeout(5_000) });
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || !/^image\//.test(type)) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    return bytes.length && bytes.length <= MAX_BYTES ? { bytes, type } : null;
  } catch {
    return null;
  }
}

/** The icon for a host, or null when the site has none (the UI then shows a letter avatar). */
export async function favicon(host: string): Promise<{ bytes: Uint8Array; type: string } | null> {
  if (!isPublicHost(host)) return null;
  const file = Bun.file(`${DIR}/${host}`);
  const meta = Bun.file(`${DIR}/${host}.type`);
  if (await file.exists()) return file.size ? { bytes: await file.bytes(), type: await meta.text() } : null;
  const icon = await fetchIcon(host);
  await Bun.write(file, icon?.bytes ?? "");
  if (icon) await Bun.write(meta, icon.type);
  return icon;
}
