// Unsplash wallpapers for the board, proxied so the access key stays on the server. Without a key, the built-in photos.
// Follows the Unsplash API guidelines: hotlink their URLs, attribute with utm params, ping download_location.
import type { WallpaperResults } from "../../shared/types";
import { builtInWallpapers, DEFAULT_QUERY, rankForTheme, toWallpaper, type Theme } from "../core/wallpapers";
import { UNSPLASH_KEY as KEY } from "./config";

const API = "https://api.unsplash.com";

export async function searchWallpapers(query: string, theme: Theme): Promise<WallpaperResults> {
  if (!KEY) return builtInWallpapers(query, theme);
  const q = new URLSearchParams({ query: query.trim() || DEFAULT_QUERY[theme], orientation: "landscape", per_page: "18", content_filter: "high" });
  const r = await fetch(`${API}/search/photos?${q}`, { headers: { Authorization: `Client-ID ${KEY}`, "Accept-Version": "v1" } });
  if (!r.ok) throw new Error(`Unsplash ${r.status}`);
  const { results } = (await r.json()) as { results: any[] };
  const photos = results.map((p) => toWallpaper({
    id: p.id, raw: p.urls.raw, color: p.color ?? "#777777", author: p.user?.name ?? "Unknown",
    authorUrl: p.user?.links?.html ?? "https://unsplash.com", photoUrl: p.links?.html ?? "https://unsplash.com",
    downloadLocation: p.links?.download_location ?? "",
  }));
  return { enabled: true, photos: query.trim() ? photos : rankForTheme(photos, theme) };
}

/** Required by Unsplash when a photo is used. Only their API host is allowed (no open proxy). */
export async function trackDownload(downloadLocation: string) {
  if (!downloadLocation.startsWith(`${API}/photos/`)) throw new Error("bad download location");
  if (!KEY) return;
  await fetch(downloadLocation, { headers: { Authorization: `Client-ID ${KEY}` } });
}
