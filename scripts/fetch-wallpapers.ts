// Refresh the built-in wallpapers (server/core/wallpapers.json): about 50 photos per theme from Unsplash, used when
// UNSPLASH_ACCESS_KEY isn't set. Stores links and credits only; the images are hotlinked from Unsplash's CDN.
// bun scripts/fetch-wallpapers.ts   (needs UNSPLASH_ACCESS_KEY in .env)
import { DEFAULT_QUERY, rankForTheme, type Theme } from "../server/core/wallpapers";

const KEY = process.env.UNSPLASH_ACCESS_KEY;
if (!KEY) throw new Error("set UNSPLASH_ACCESS_KEY in .env");
const QUERIES: Record<Theme, string[]> = {
  dark: [DEFAULT_QUERY.dark, "starry night sky", "northern lights", "misty forest night", "mountains at dusk", "city skyline night"],
  light: [DEFAULT_QUERY.light, "pastel sky clouds", "calm beach morning", "snowy mountains sunny", "green rolling hills", "desert dunes"],
};
const PER_THEME = 50;

const out = [];
const seen = new Set<string>();
for (const theme of ["dark", "light"] as const) {
  const found = [];
  for (const query of QUERIES[theme]) {
    const q = new URLSearchParams({ query, orientation: "landscape", per_page: "30", content_filter: "high" });
    const r = await fetch(`https://api.unsplash.com/search/photos?${q}`, { headers: { Authorization: `Client-ID ${KEY}`, "Accept-Version": "v1" } });
    if (!r.ok) throw new Error(`Unsplash ${r.status} for "${query}"`);
    for (const p of ((await r.json()) as { results: any[] }).results) {
      if (seen.has(p.id) || !p.urls?.raw || !p.user?.name) continue;
      seen.add(p.id);
      found.push({
        theme, id: p.id, raw: p.urls.raw, color: p.color ?? "#777777",
        description: String(p.alt_description ?? p.description ?? query).slice(0, 140),
        author: p.user.name, authorUrl: p.user.links.html, photoUrl: p.links.html, downloadLocation: p.links.download_location,
      });
    }
  }
  out.push(...rankForTheme(found, theme).slice(0, PER_THEME));
}
await Bun.write("server/core/wallpapers.json", JSON.stringify(out, null, 1) + "\n");
console.log(`server/core/wallpapers.json: ${out.length} photos`);
