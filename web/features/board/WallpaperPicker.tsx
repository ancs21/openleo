// Background picker: Unsplash search (results ranked for the current theme), Auto, or a custom image URL.
import { useEffect, useState } from "react";
import type { Wallpaper, WallpaperResults } from "../../../shared/types";
import { fieldClass } from "../../components/field";
import { api } from "../../lib/api";

export function WallpaperPicker({ theme, current, onChoose, onCustom, onAuto }: {
  theme: "light" | "dark"; current?: Wallpaper; onChoose: (w: Wallpaper) => void; onCustom: (url: string) => void; onAuto: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<WallpaperResults>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    const t = setTimeout(() => {
      api<WallpaperResults>(`/api/wallpapers?theme=${theme}&q=${encodeURIComponent(query)}`)
        .then((r) => { setResults(r); setError(undefined); }, (e) => setError((e as Error).message));
    }, 300); // debounce typing
    return () => clearTimeout(t);
  }, [query, theme]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between text-[12px] font-medium text-ink-2">
        <span>Background · {theme} theme</span>
        <button type="button" onClick={onAuto} className="text-accent-ink hover:underline">Auto</button>
      </div>
      {results?.enabled === false ? (
        <p className="rounded-[8px] bg-inset p-2.5 text-[12px] leading-relaxed text-ink-3">
          Browse Unsplash by adding <code className="font-mono text-ink-2">UNSPLASH_ACCESS_KEY</code> to <code className="font-mono text-ink-2">.env</code> (free at unsplash.com/developers), then restart.
        </p>
      ) : (
        <>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={results?.builtIn ? "Search built-in photos…" : "Search Unsplash…"} aria-label="Search wallpapers" className={`${fieldClass} h-8 px-2.5`} />
          {error && <p className="text-[12px] text-red">{error}</p>}
          {results?.builtIn && <p className="text-[12px] text-ink-3">Add <code className="font-mono">UNSPLASH_ACCESS_KEY</code> to <code className="font-mono">.env</code> to search all of Unsplash.</p>}
          {results?.builtIn && !results.photos.length && <p className="text-[12px] text-ink-3">No matches.</p>}
          <div className="grid auto-rows-min grid-cols-3 gap-2">
            {results?.photos.map((p) => (
              <button key={p.id} type="button" onClick={() => onChoose(p)} title={`Photo by ${p.author}`} aria-pressed={current?.id === p.id}
                className={`aspect-[16/10] w-full overflow-hidden rounded-chip bg-cover bg-center transition-transform duration-100 hover:scale-[1.03] ${current?.id === p.id ? "ring-2 ring-accent" : ""}`}
                style={{ backgroundColor: p.color, backgroundImage: `url("${p.thumb}")` }} />
            ))}
          </div>
          <p className="text-[11px] text-ink-3">Photos from <a href="https://unsplash.com/?utm_source=openleo&utm_medium=referral" target="_blank" rel="noopener" className="underline">Unsplash</a>. Dark and light themes keep separate choices.</p>
        </>
      )}
      <input placeholder="Or an image URL…" aria-label="Custom background URL" className={`${fieldClass} h-8 px-2.5`}
        onKeyDown={(e) => { if (e.key === "Enter") { const v = e.currentTarget.value.trim(); if (v) onCustom(v); } }} />
    </div>
  );
}
