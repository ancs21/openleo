import { useState, type ReactNode } from "react";
import { fieldClass } from "./field";
import { Chevron } from "./motion";
import { Switch } from "./Switch";

export const inputCls = `${fieldClass} h-8 w-full px-2.5 focus:ring-2 focus:ring-accent/40`;

export const Info = ({ text }: { text: string }) => (
  <span title={text} aria-label={text} role="img" className="inline-flex size-4 shrink-0 cursor-help items-center justify-center rounded-full bg-ink-3 text-[10px] font-bold text-surface">i</span>
);

export function Section({ title, info, action, defaultOpen = true, children }: {
  title: string; info?: string; action?: ReactNode; defaultOpen?: boolean; children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-t border-line py-4">
      <div className="flex min-h-7 items-center gap-2">
        <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="-ml-1 flex items-center gap-2 rounded-[6px] px-1 py-0.5 hover:bg-hover">
          <Chevron open={open} size={13} /><span className="text-[14px] font-semibold">{title}</span>
        </button>
        {info && <Info text={info} />}
        <span className="flex-1" />
        {open && action}
      </div>
      {open && <div className="mt-3 pl-6">{children}</div>}
    </div>
  );
}

export const Group = ({ title, children }: { title?: string; children: ReactNode }) => (
  <div className="rounded-card border border-line bg-surface px-3.5 py-2.5">
    {title && <div className="mb-1 text-[12.5px] font-medium text-ink-3">{title}</div>}
    {children}
  </div>
);

export const Row = ({ label, info, extra, checked, onChange, disabled }: { label: string; info?: string; extra?: ReactNode; checked: boolean; onChange: () => void; disabled?: boolean }) => (
  <div className="flex min-h-9 items-center gap-2">
    <span className="min-w-0 truncate text-[13.5px]">{label}</span>
    {info && <Info text={info} />}
    <span className="flex-1" />
    {extra}
    <Switch label={label} checked={checked} onChange={onChange} disabled={disabled} />
  </div>
);

export const LinkButton = ({ children, onClick, danger }: { children: ReactNode; onClick: () => void; danger?: boolean }) => (
  <button type="button" onClick={onClick} className={`rounded-[6px] px-1.5 py-0.5 text-[13px] font-medium hover:bg-hover ${danger ? "text-red" : "text-ink"}`}>{children}</button>
);

export const Label = ({ text, hint, children }: { text: string; hint?: string; children: ReactNode }) => (
  <label className="flex flex-col gap-1.5">
    <span className="text-[12.5px] font-medium text-ink-2">{text}{hint && <span className="font-normal text-ink-3"> · {hint}</span>}</span>
    {children}
  </label>
);

export const empty = "py-12 text-center text-[13px] text-ink-3";
