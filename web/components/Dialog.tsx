import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { useEscape } from "../lib/hooks";
import { Icon, glyphs } from "./Icon";
import { IconButton } from "./IconButton";

/** A large dialog over everything: title and close, a scrolling body, and an optional footer. Esc closes it (only it). */
export function Dialog({ title, onClose, children, footer, className = "w-[min(880px,calc(100vw-32px))]" }: {
  title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; className?: string;
}) {
  useEscape(onClose, { exclusive: true });
  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-black/40 animate-fade-in" onClick={onClose} />
      <div className={`relative flex max-h-[min(720px,calc(100vh-32px))] flex-col overflow-hidden rounded-card bg-surface shadow-overlay animate-pop-in ${className}`}>
        <div className="flex shrink-0 items-center justify-between gap-2 px-4 pt-3.5 pb-2">
          <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
          <IconButton size="sm" aria-label="Close" onClick={onClose}><Icon>{glyphs.close}</Icon></IconButton>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-3 px-4 pb-4">{children}</div>
        {footer && <div className="flex shrink-0 justify-center border-t border-line px-4 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
