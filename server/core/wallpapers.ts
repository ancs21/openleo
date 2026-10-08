// Board wallpapers, the rules: which photos suit a theme, and the built-in photos used without an Unsplash key
// (core/wallpapers.json: links and credits only; the images load from Unsplash's CDN). Searching Unsplash is in infra/unsplash.ts.
import type { Wallpaper, WallpaperResults } from "../../shared/types";
import BUILT_IN from "./wallpapers.json";

const UTM = "utm_source=openleo&utm_medium=referral";

/** Calm, wide scenes that read well behind translucent lists, per theme. */
export const DEFAULT_QUERY = { dark: "night mountain landscape", light: "bright mountain lake landscape" } as const;
export type Theme = keyof typeof DEFAULT_QUERY;

/** Relative luminance (0 = black, 1 = white) of a #rrggbb colour. */
export function luminance(hex: string) {
  const n = Number.parseInt(hex.replace("#", ""), 16);
  if (Number.isNaN(n)) return 0.5;
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

/**
 * Target brightness per theme: dark-but-not-black for dark, bright-but-not-washed-out for light,
 * so translucent lists stay readable on top. Photos closest to the target come first.
 */
export const TARGET_LUMINANCE = { dark: 0.06, light: 0.45 } as const;
export const rankForTheme = <T extends { color: string }>(photos: T[], theme: Theme) =>
  [...photos].sort((a, b) => Math.abs(luminance(a.color) - TARGET_LUMINANCE[theme]) - Math.abs(luminance(b.color) - TARGET_LUMINANCE[theme]));

const withUtm = (url: string) => `${url}${url.includes("?") ? "&" : "?"}${UTM}`;

export type Photo = { id: string; raw: string; color: string; author: string; authorUrl: string; photoUrl: string; downloadLocation: string };
export const toWallpaper = (p: Photo): Wallpaper => ({
  id: p.id,
  thumb: `${p.raw}&w=400&q=70&auto=format&fit=crop`, // auto=format: AVIF or WebP where the browser takes it
  url: `${p.raw}&w=2400&q=80&auto=format&fit=crop`,
  color: p.color,
  author: p.author,
  authorUrl: withUtm(p.authorUrl),
  photoUrl: withUtm(p.photoUrl),
  downloadLocation: p.downloadLocation,
});

/** Without a key: the built-in photos (hotlinked from Unsplash), this theme's by default, or any whose words match. */
export function builtInWallpapers(query: string, theme: Theme, all: (Photo & { theme: string; description: string })[] = BUILT_IN): WallpaperResults {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const hits = words.length
    ? all.filter((p) => words.every((w) => `${p.description} ${p.author}`.toLowerCase().includes(w)))
    : all.filter((p) => p.theme === theme);
  return { enabled: true, builtIn: true, photos: rankForTheme(hits, theme).map(toWallpaper) };
}
