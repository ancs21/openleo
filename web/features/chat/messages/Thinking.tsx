import { useState } from "react";
import { Icon, glyphs } from "../../../components/Icon";
import { Markdown } from "../../../components/Markdown";
import { Chevron, Reveal, Shimmer } from "../../../components/motion";

export function Thinking({ text, active }: { text: string; active: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="w-full">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)}
        className="-mx-1.5 flex w-fit items-center gap-2 rounded-control px-1.5 py-1 transition-colors duration-100 hover:bg-hover-2">
        <span className="text-ink-3"><Icon size={13} fill="currentColor">{glyphs.think}</Icon></span>
        <span role="status">
          {active ? (
            <Shimmer className="text-[13px] font-medium">Thinking…</Shimmer>
          ) : <span className="text-[13px] font-medium text-ink-2 animate-fade-in">Thought</span>}
        </span>
        <span className="text-ink-3"><Chevron open={open} /></span>
      </button>
      <Reveal open={open}>
        <div className="mt-1 ml-[5px] border-l border-line py-1 pl-4">
          <Markdown text={text} tone="text-[12.5px] leading-relaxed text-ink-2" />
        </div>
      </Reveal>
    </div>
  );
}

/** Shown whenever the agent is busy but nothing is streaming yet. */
export const Working = ({ label = "Thinking…" }: { label?: string }) => (
  <div className="flex h-7 items-center gap-2 animate-fade-in">
    <span className="text-ink-3"><Icon size={13} fill="currentColor">{glyphs.think}</Icon></span>
    <Shimmer className="text-[13px] font-medium">{label}</Shimmer>
  </div>
);
