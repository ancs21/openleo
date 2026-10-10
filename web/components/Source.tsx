// Web sources: an inline chip for cited links, and the "N sources" toggle + list under a reply.
import { useState } from "react";

const SHOWN = 8;

export const hostOf = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; } };

const hue = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);

/** The site's icon via the server, or a coloured letter when it has none. */
export function SiteAvatar({ url, size = "size-3.5", round = "rounded-[4px]", ring = false }: { url: string; size?: string; round?: string; ring?: boolean }) {
  const host = hostOf(url);
  const [failed, setFailed] = useState(false);
  if (!failed) return (
    <img src={`/api/favicon/${encodeURIComponent(host)}?v=2`} alt="" aria-hidden="true" loading="lazy" onError={() => setFailed(true)}
      className={`shrink-0 bg-surface object-contain ${size} ${round} ${ring ? "shadow-[0_0_0_1.5px_var(--canvas)]" : ""}`} />
  );
  return (
    <span aria-hidden="true" style={{ background: `oklch(62% 0.13 ${hue(host)})` }}
      className={`inline-flex shrink-0 items-center justify-center text-[8.5px] leading-none font-bold text-white uppercase ${size} ${round} ${ring ? "shadow-[0_0_0_1.5px_var(--canvas)]" : ""}`}>
      {host[0]}
    </span>
  );
}

export const SourceChip = ({ href, label }: { href: string; label: string }) => (
  <a href={href} target="_blank" rel="noopener noreferrer" title={href}
    className="mx-0.5 inline-flex h-4.5 translate-y-[-1px] items-center gap-1 rounded-[5px] bg-inset px-[3px] align-middle font-mono text-[10.5px] text-ink-2 no-underline shadow-hairline transition-colors duration-150 hover:bg-hover hover:text-ink">
    <SiteAvatar url={href} size="size-3" round="rounded-[3px]" />
    <span>{label}</span>
  </a>
);

export const SourceStack = ({ urls, open, onToggle }: { urls: string[]; open: boolean; onToggle: () => void }) => (
  <button type="button" aria-expanded={open} onClick={onToggle}
    className="flex items-center gap-1.5 rounded-[6px] px-1 py-0.5 text-left transition-colors duration-150 hover:bg-hover">
    <span className="flex -space-x-1">
      {urls.slice(0, 4).map((u) => <SiteAvatar key={u} url={u} round="rounded-full" ring />)}
    </span>
    <span className="text-[12px] text-ink-2">{urls.length} {urls.length === 1 ? "source" : "sources"}</span>
  </button>
);

export function SourceList({ urls, open }: { urls: string[]; open: boolean }) {
  const [all, setAll] = useState(false);
  return (
    <div className="grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)]"
      style={{ gridTemplateRows: open ? "1fr" : "0fr", opacity: open ? 1 : 0 }}>
      <div className="overflow-hidden">
        <div className="mt-1.5 flex flex-col rounded-[10px] bg-inset p-1 shadow-hairline">
          {(all ? urls : urls.slice(0, SHOWN)).map((u) => {
            const url = new URL(u);
            return (
              <a key={u} href={u} target="_blank" rel="noopener noreferrer" tabIndex={open ? 0 : -1}
                className="flex min-w-0 items-center gap-2 rounded-[6px] px-1.5 py-1 text-[12px] text-ink-2 transition-colors duration-150 hover:bg-hover hover:text-ink">
                <SiteAvatar url={u} size="size-4" />
                <span className="shrink-0">{hostOf(u)}</span>
                <span className="ml-auto min-w-0 truncate font-mono text-[10.5px] text-ink-3">{url.pathname === "/" ? "" : url.pathname}</span>
              </a>
            );
          })}
          {!all && urls.length > SHOWN && (
            <button type="button" tabIndex={open ? 0 : -1} onClick={() => setAll(true)}
              className="rounded-[6px] px-1.5 py-1 text-left text-[12px] text-ink-3 transition-colors duration-150 hover:bg-hover hover:text-ink-2">
              Show all {urls.length}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
