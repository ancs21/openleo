/** A real checkbox with role="switch" (keyboard + screen readers) under a pill track. */
export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: () => void; label: string; disabled?: boolean }) {
  return (
    <span className={`relative inline-flex shrink-0 ${disabled ? "opacity-40" : ""}`}>
      {/* A checkbox keeps its small size even with inset-0: size-full and m-0 make the whole pill clickable. */}
      <input type="checkbox" role="switch" checked={checked} onChange={onChange} disabled={disabled} aria-label={label} className="peer absolute inset-0 m-0 size-full cursor-pointer appearance-none opacity-0 disabled:cursor-not-allowed" />
      {/* The transformed knob would otherwise sit above the checkbox and swallow clicks. */}
      <span aria-hidden="true"
        className={`pointer-events-none flex h-[22px] w-[38px] items-center rounded-full p-0.5 transition-colors duration-150 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent ${checked ? "bg-ink" : "bg-ink-3/45"}`}>
        <span className={`size-[18px] rounded-full bg-surface shadow-btn transition-transform duration-150 ${checked ? "translate-x-4" : ""}`} />
      </span>
    </span>
  );
}
