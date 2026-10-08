// The site's sidebar, the same on every page: the logo, the theme, the menu and the download buttons.
// The home page puts its story list in the middle (children).
import type { ReactNode } from "react";
import { buttonClass } from "../web/components/Button";
import { Icon } from "../web/components/Icon";
import { Logo } from "../web/components/Logo";
import { ThemeSwitch } from "../web/components/ThemeSwitch";
import { detectDownload, DOWNLOADS, GITHUB } from "./downloads";

const DOWNLOAD = detectDownload();
const BIG = "h-10 px-4 text-[14px]";

/** Which system the button downloads for, with direct links for the others. */
export const DownloadNote = ({ className = "" }: { className?: string }) => (
  <p className={`text-[12px] text-ink-3 ${className}`}>
    {DOWNLOAD.note} · Also for{" "}
    {DOWNLOADS.filter((d) => d !== DOWNLOAD).map((d, i, rest) => (
      <span key={d.file}>
        <a href={d.url} className="underline underline-offset-2 hover:text-ink">{d.label}</a>{i < rest.length - 1 ? ", " : ""}
      </span>
    ))}
  </p>
);


export const DownloadButton = ({ big = false, className = "" }: { big?: boolean; className?: string }) => (
  <a href={DOWNLOAD.url} className={`${buttonClass("primary")} ${big ? BIG : ""} ${className}`}>
    <Icon size={big ? 15 : 13}><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></Icon>Download for {DOWNLOAD.os}
  </a>
);

export const GitHubMark = ({ size }: { size: number }) => (
  <svg viewBox="0 0 16 16" width={size} height={size} fill="currentColor" aria-hidden="true">
    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
  </svg>
);

export const GitHubButton = ({ className = "" }: { className?: string }) => (
  <a href={GITHUB} className={`${buttonClass()} ${BIG} ${className}`}>
    <GitHubMark size={15} />GitHub
  </a>
);

const MENU = [["Download", "download"], ["Changelog", "changelog"], ["Blog", "blog"]] as const;

/** `base`: the way back to the site's root from this page ("./", or "../" from a blog post). `current`: this page in the menu. */
export function Sidebar({ base = "./", current, children }: { base?: string; current?: string; children?: ReactNode }) {
  return (
    <aside className="flex shrink-0 flex-col gap-6 border-line px-6 py-8 lg:sticky lg:top-0 lg:h-screen lg:w-[270px] lg:border-r max-lg:border-b">
      <div className="flex items-center justify-between gap-3">
        <a href={children ? "#top" : base} className="flex items-center gap-2 text-[15px] font-semibold tracking-[-0.01em]" aria-label="OpenLeo"><Logo className="size-8" follow />OpenLeo</a>
        <ThemeSwitch className="w-[96px]" />
      </div>
      <nav aria-label="Site" className="-mt-2 flex gap-4 text-[13px] text-ink-2">
        {MENU.map(([label, page]) => (
          <a key={page} href={base + page} aria-current={current === page ? "page" : undefined}
            className={current === page ? "font-medium text-ink" : "hover:text-ink"}>{label}</a>
        ))}
      </nav>
      {children}
      <div className="mt-auto flex flex-col gap-2">
        <DownloadButton big className="w-full" />
        <GitHubButton className="w-full" />
        <DownloadNote className="text-center" />
      </div>
    </aside>
  );
}
