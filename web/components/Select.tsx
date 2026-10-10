import { useState, type ReactNode } from "react";
import { fieldClass } from "./field";
import { Icon, glyphs } from "./Icon";
import { MenuItem, Popover } from "./Popover";

export type Option<T extends string> = { value: T; label: string; extra?: string; icon?: ReactNode };

/** Uses the app's menu style, not the browser's. */
export function Select<T extends string>({ value, options, onChange, label, className = "w-full", mono = false, bare = false, search = false, placeholder }: {
  value: T; options: Option<T>[]; onChange: (value: T) => void; label: string; className?: string; mono?: boolean;
  bare?: boolean;
  search?: boolean;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const current = options.find((o) => o.value === value);
  const q = query.trim().toLowerCase();
  const shown = q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
  const pick = (v: T) => { onChange(v); setOpen(false); setQuery(""); };
  return (
    <div className={className}>
      <Popover open={open} onClose={() => setOpen(false)} align="left" matchWidth className="max-h-72 min-w-48 overflow-y-auto" trigger={
        <button type="button" aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}
          className={`${bare ? "rounded-[6px] hover:bg-hover" : fieldClass} flex h-8 w-full items-center gap-2 px-2.5 text-left focus-visible:ring-2 focus-visible:ring-accent/40 ${mono ? "font-mono text-[12.5px]" : ""}`}>
          {current?.icon}
          <span className={`min-w-0 flex-1 truncate ${!current && !value ? "text-ink-3" : ""}`}>{current?.label ?? (value || placeholder)}</span>
          <Icon size={12} className="shrink-0 text-ink-3">{glyphs.chevron}</Icon>
        </button>
      }>
        {search && (
          <input autoFocus aria-label={`Search ${label.toLowerCase()}`} placeholder="Search…" value={query} onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && shown[0]) { e.preventDefault(); pick(shown[0].value); } }}
            className={`${fieldClass} sticky top-0 z-10 mb-1 h-8 w-full px-2.5`} />
        )}
        {shown.map((o) => (
          <MenuItem key={o.value} icon={o.icon} checked={o.value === value} extra={o.extra && <span className="shrink-0 text-[11px] font-normal text-ink-3">{o.extra}</span>}
            onClick={() => pick(o.value)}>{o.label}</MenuItem>
        ))}
        {search && !shown.length && <p className="px-2 py-1.5 text-[12.5px] text-ink-3">No matches</p>}
      </Popover>
    </div>
  );
}
