import { setTheme, useTheme, type Theme } from "../lib/theme";

const OPTIONS: { value: Theme; label: string; icon: React.ReactNode }[] = [
  { value: "light", label: "Light", icon: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></> },
  { value: "dark", label: "Dark", icon: <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /> },
  { value: "system", label: "System", icon: <><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /></> },
];

/** Segmented Light / Dark / System switch with a sliding pill. */
export function ThemeSwitch({ className = "" }: { className?: string }) {
  const theme = useTheme();
  const i = OPTIONS.findIndex((o) => o.value === theme);
  return (
    <div role="radiogroup" aria-label="Theme" className={`relative grid grid-cols-3 rounded-[8px] bg-field p-0.5 shadow-inset-field ${className}`}>
      <span aria-hidden className="absolute top-0.5 bottom-0.5 left-0.5 rounded-[6px] bg-surface shadow-btn transition-transform duration-200"
        style={{ width: "calc((100% - 4px) / 3)", transform: `translateX(${i * 100}%)`, transitionTimingFunction: "cubic-bezier(0.23,1,0.32,1)" }} />
      {OPTIONS.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={theme === o.value} aria-label={o.label} title={o.label} data-sound="tick"
          onClick={() => setTheme(o.value)}
          className={`relative z-10 flex h-7 items-center justify-center rounded-[6px] transition-colors duration-150 ${theme === o.value ? "text-ink" : "text-ink-3 hover:text-ink-2"}`}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{o.icon}</svg>
        </button>
      ))}
    </div>
  );
}
