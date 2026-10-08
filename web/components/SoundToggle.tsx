import { useState } from "react";
import { play, setSoundsOn, soundsOn } from "../lib/sounds";

export function SoundToggle() {
  const [on, setOn] = useState(soundsOn);
  return (
    <button type="button" role="switch" aria-checked={on} data-sound="tick"
      onClick={() => { setSoundsOn(!on); setOn(!on); if (!on) play("tick"); }}
      className="flex h-8 w-full items-center gap-2 rounded-chip px-2 text-left text-[12.5px] text-ink-2 transition-colors duration-100 hover:bg-hover hover:text-ink">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M11 5L6 9H2v6h4l5 4z" />{on ? <path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14" /> : <path d="M22 9l-6 6M16 9l6 6" />}
      </svg>
      <span className="flex-1">Sounds</span>
      <span className={`relative h-4 w-7 rounded-full transition-colors duration-150 ${on ? "bg-ink" : "bg-line-strong"}`}>
        <span className="absolute top-0.5 size-3 rounded-full bg-surface transition-[left] duration-150" style={{ left: on ? 14 : 2 }} />
      </span>
    </button>
  );
}
