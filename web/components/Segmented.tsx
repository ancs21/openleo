/** Segmented control: one choice out of a few, shown as a pill row. */
export function Segmented<T extends string>({ value, options, onChange, className = "" }: {
  value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; className?: string;
}) {
  return (
    <div role="tablist" className={`inline-flex rounded-control bg-field p-0.5 shadow-inset-field ${className}`}>
      {options.map((o) => (
        <button key={o.value} type="button" role="tab" aria-selected={o.value === value} onClick={() => onChange(o.value)}
          className={`h-7 flex-1 rounded-[7px] px-3 text-[12.5px] font-medium transition-colors duration-100 ${o.value === value ? "bg-surface text-ink shadow-btn" : "text-ink-3 hover:text-ink"}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
