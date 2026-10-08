import type { Wallpaper } from "../../shared/types";

/** Unsplash requires crediting the photographer wherever the photo is shown. `onPanel`: on a frosted panel, not the photo. */
export function WallpaperCredit({ photo, className = "", onPanel = false }: { photo?: Wallpaper; className?: string; onPanel?: boolean }) {
  if (!photo) return null;
  const tone = onPanel ? "text-ink-3" : "text-white/75 [text-shadow:0_1px_2px_rgb(0_0_0/0.6)]";
  const link = onPanel ? "underline hover:text-ink-2" : "underline hover:text-white";
  return (
    <div className={`text-[11px] ${tone} ${className}`}>
      Photo by <a href={photo.authorUrl} target="_blank" rel="noopener" className={link}>{photo.author}</a> on{" "}
      <a href={photo.photoUrl} target="_blank" rel="noopener" className={link}>Unsplash</a>
    </div>
  );
}
