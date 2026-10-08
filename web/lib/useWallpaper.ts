// Board wallpaper: one choice per theme (light/dark), stored in this browser. With Unsplash enabled and no
// choice yet, the best match for the current theme is picked automatically.
import { useEffect, useState } from "react";
import type { Wallpaper, WallpaperResults } from "../../shared/types";
import { api, json } from "./api";
import { storage } from "./storage";
import { useIsDark } from "./theme";

const KEY = "openleo-wallpaper";
type Choice = Wallpaper | { custom: string };
type Saved = { light?: Choice; dark?: Choice };

const load = (): Saved => { try { return JSON.parse(storage.get(KEY) ?? "{}"); } catch { return {}; } };

export function useWallpaper() {
  const theme: "light" | "dark" = useIsDark() ? "dark" : "light";
  const [saved, setSaved] = useState<Saved>(load);
  const choice = saved[theme];

  const save = (next: Saved) => { setSaved(next); storage.set(KEY, JSON.stringify(next)); };
  const choose = (c: Choice | undefined) => {
    save({ ...saved, [theme]: c });
    if (c && "downloadLocation" in c) void api("/api/wallpapers/use", json({ downloadLocation: c.downloadLocation })).catch(() => {});
  };

  // Auto-pick for this theme when nothing is chosen yet.
  useEffect(() => {
    if (choice) return;
    let gone = false;
    api<WallpaperResults>(`/api/wallpapers?theme=${theme}`)
      .then((r) => { const best = r.photos[0]; if (!gone && best) choose(best); })
      .catch(() => {});
    return () => { gone = true; };
  }, [theme, !!choice]); // eslint-disable-line react-hooks/exhaustive-deps

  const url = !choice ? undefined : "custom" in choice ? choice.custom : choice.url;
  const photo = choice && !("custom" in choice) ? choice : undefined;
  return { theme, url, photo, choose, reset: () => choose(undefined) };
}

/** The calm gradient a board shows until a wallpaper is chosen. */
export const DEFAULT_BG = {
  dark: "linear-gradient(160deg, #10161f 0%, #1d3340 40%, #2c4a4a 70%, #4a4a3c 100%)",
  light: "linear-gradient(160deg, #20313f 0%, #2f5f66 38%, #6c8f7d 62%, #c7a77c 100%)",
};

/** CSS background for a page showing the wallpaper (a calm gradient until one is chosen). */
export function wallpaperBackground({ url, photo, theme }: ReturnType<typeof useWallpaper>) {
  return url ? `center / cover no-repeat url("${encodeURI(url)}"), ${photo?.color ?? DEFAULT_BG[theme]}` : DEFAULT_BG[theme];
}
