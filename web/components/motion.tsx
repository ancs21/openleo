import type { ReactNode } from "react";
import { glyphs } from "./Icon";

export const EASE = "cubic-bezier(0.23, 1, 0.32, 1)";

export function Shimmer({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span className={`bg-clip-text whitespace-nowrap text-transparent ${className}`}
      style={{ backgroundImage: "linear-gradient(90deg, var(--ink-3) 35%, var(--ink) 50%, var(--ink-3) 65%)", backgroundSize: "200% 100%", animation: "shimmer-text 1.4s linear infinite" }}>
      {children}
    </span>
  );
}

export function Spinner({ className = "size-3 border-line-strong border-t-ink-2" }: { className?: string }) {
  return <span className={`shrink-0 rounded-full border-[1.5px] animate-spin-fast ${className}`} />;
}

export function Chevron({ open, size = 12 }: { open: boolean; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
      className="transition-transform duration-200" style={{ transform: open ? "rotate(0deg)" : "rotate(-90deg)" }} aria-hidden="true">
      {glyphs.chevron}
    </svg>
  );
}

/** Collapsible region (grid-rows trick). */
export function Reveal({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <div className="grid transition-[grid-template-rows,opacity] duration-300" style={{ gridTemplateRows: open ? "1fr" : "0fr", opacity: open ? 1 : 0, transitionTimingFunction: EASE }}>
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}
