// A real, visually hidden <input> (keyboard + screen readers)
// over an 18px box that fills with the accent when checked. Place inside a <label> to make the row clickable.
export function Checkbox({ checked, onChange, label }: { checked: boolean; onChange: () => void; label?: string }) {
  return (
    <span className="group/cb relative inline-flex size-6 shrink-0 items-center justify-center">
      <input type="checkbox" checked={checked} onChange={onChange} aria-label={label} className="peer absolute size-px opacity-0" />
      <span aria-hidden="true"
        className={`flex size-[18px] items-center justify-center rounded-[6px] border transition-[background-color,border-color,transform] duration-150 group-active/cb:scale-[0.96]
          peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent
          ${checked ? "border-accent bg-accent text-white" : "border-line-strong bg-surface group-hover/cb:border-ink-3 group-hover/cb:bg-hover dark:bg-field"}`}>
        {checked && (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 4 4L19 6" /></svg>
        )}
      </span>
    </span>
  );
}
