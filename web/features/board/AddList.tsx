import { useState } from "react";
import { fieldClass } from "../../components/field";
import { Icon, glyphs } from "../../components/Icon";

export function AddList({ onAdd }: { onAdd: (title: string) => void }) {
  const [on, setOn] = useState(false);
  return on ? (
    <div className="w-[272px] shrink-0 rounded-[14px] bg-surface/80 p-2 shadow-raised backdrop-blur-xl">
      <input autoFocus placeholder="List name" aria-label="New list name" onBlur={() => setOn(false)}
        onKeyDown={(e) => { if (e.key === "Enter") { const v = e.currentTarget.value.trim(); if (v) onAdd(v); setOn(false); } if (e.key === "Escape") setOn(false); }}
        className={`${fieldClass} h-8 w-full px-2.5`} />
    </div>
  ) : (
    <button type="button" aria-label="Add list" onClick={() => setOn(true)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white/90 hover:bg-white/15">
      <Icon size={18}>{glyphs.plus}</Icon>
    </button>
  );
}
