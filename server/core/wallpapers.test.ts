import { expect, test } from "bun:test";
import { builtInWallpapers, luminance, rankForTheme } from "./wallpapers";
import { trackDownload } from "../infra/unsplash";

test("luminance orders colours from dark to light", () => {
  expect(luminance("#000000")).toBe(0);
  expect(luminance("#ffffff")).toBeCloseTo(1);
  expect(luminance("#202840")).toBeLessThan(luminance("#c0d0e0"));
});

test("dark theme prefers dark (not black) photos; light theme prefers bright but not near-white ones", () => {
  const photos = [{ color: "#f3f3f3" }, { color: "#000000" }, { color: "#3a4650" }, { color: "#a8b8c0" }];
  expect(rankForTheme(photos, "dark")[0]!.color).toBe("#3a4650"); // dark scene, not a black frame
  expect(rankForTheme(photos, "light")[0]!.color).toBe("#a8b8c0"); // bright scene, not a white void
  expect(rankForTheme(photos, "light").at(-1)!.color).toBe("#000000");
});

test("download tracking only calls Unsplash's API (no open proxy)", async () => {
  await expect(trackDownload("https://evil.example/x")).rejects.toThrow("bad download location");
  await expect(trackDownload("https://api.unsplash.com.evil.example/photos/x")).rejects.toThrow("bad download location");
});

test("without a key: the built-in photos, this theme's by default, any theme's when searching", () => {
  const p = (id: string, theme: string, description: string, color: string) =>
    ({ id, theme, description, color, raw: `https://images.unsplash.com/photo-${id}?ixid=x`, author: "Ana", authorUrl: "https://unsplash.com/@ana", photoUrl: `https://unsplash.com/photos/${id}`, downloadLocation: "" });
  const all = [p("a", "dark", "starry night over a lake", "#101820"), p("b", "light", "calm beach at dawn", "#a0b0c0"), p("c", "dark", "black frame", "#000000")];
  const dark = builtInWallpapers("", "dark", all);
  expect(dark.builtIn).toBe(true);
  expect(dark.photos.map((w) => w.id)).toEqual(["a", "c"]); // ranked for the theme
  expect(dark.photos[0]!.thumb).toBe("https://images.unsplash.com/photo-a?ixid=x&w=400&q=70&auto=format&fit=crop");
  expect(dark.photos[0]!.authorUrl).toContain("utm_source=openleo");
  expect(builtInWallpapers("Beach", "dark", all).photos.map((w) => w.id)).toEqual(["b"]);
  expect(builtInWallpapers("snow", "dark", all).photos).toEqual([]);
});
