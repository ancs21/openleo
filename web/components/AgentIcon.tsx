import { useState } from "react";
import { Popover } from "./Popover";
import { ICONS } from "../../shared/icons";

/** The default icon: a large and a small sparkle. */
const SPARKLES = "M10 3.5l1.9 5.6 5.6 1.9-5.6 1.9L10 18.5l-1.9-5.6L2.5 11l5.6-1.9zM18.5 2l.9 2.6 2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9z";

const glyph = (name: string | undefined, className: string) => {
  const inner = name && Object.hasOwn(ICONS, name) ? ICONS[name] : undefined;
  return inner
    ? <svg viewBox="0 0 256 256" fill="currentColor" aria-hidden="true" className={`shrink-0 ${className}`} dangerouslySetInnerHTML={{ __html: inner }} />
    : <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={`shrink-0 ${className}`}><path d={SPARKLES} /></svg>;
};

export const AgentIcon = ({ icon, className = "size-3.5" }: { icon?: string; className?: string }) => glyph(icon, className);

/** The first choice is the default sparkles. */
export function AgentIconPicker({ icon, onChange }: { icon?: string; onChange: (icon?: string) => void }) {
  const [open, setOpen] = useState(false);
  const current = icon && Object.hasOwn(ICONS, icon) ? icon : undefined;
  return (
    <Popover open={open} onClose={() => setOpen(false)} align="left" className="w-[296px] p-2" trigger={
      <button type="button" aria-label="Choose an icon" title="Choose an icon" aria-expanded={open} onClick={() => setOpen((o) => !o)}
        className="flex size-10 items-center justify-center rounded-control bg-surface text-ink shadow-btn transition-colors duration-100 hover:bg-hover">
        {glyph(current, "size-5")}
      </button>
    }>
      <div className="grid grid-cols-8 gap-0.5">
        {[undefined, ...Object.keys(ICONS)].map((name) => {
          const label = name ? name.replace(/-/g, " ") : "sparkles (default)";
          return (
            <button key={name ?? "default"} type="button" title={label} aria-label={`Use the ${label} icon`} aria-pressed={name === current}
              onClick={() => { onChange(name); setOpen(false); }}
              className={`flex size-8.5 items-center justify-center rounded-[6px] transition-colors duration-100 hover:bg-hover hover:text-ink ${name === current ? "bg-hover-2 text-ink" : "text-ink-2"}`}>
              {glyph(name, "size-4")}
            </button>
          );
        })}
      </div>
    </Popover>
  );
}
