// A tab in an underlined tab row (a card's General / agent tabs, an agent's Setup / Chat).
import type { ReactNode } from "react";

export function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" role="tab" aria-selected={active} onClick={onClick}
      className={`-mb-px flex h-9 items-center gap-1.5 border-b-2 px-0.5 text-[13.5px] transition-colors duration-100 ${active ? "border-ink font-medium text-ink" : "border-transparent text-ink-2 hover:text-ink"}`}>
      {children}
    </button>
  );
}
