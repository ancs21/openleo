import { Logo } from "../../../components/Logo";
import { Markdown } from "../../../components/Markdown";
import { modelName } from "../../../lib/format";

export const StreamingText = ({ text, active }: { text: string; active: boolean }) => (
  <div className="animate-fade-in">
    <Markdown text={text} caret={active && <span className="inline-block h-[1em] w-[2px] bg-ink-2 animate-fade-in" />} />
  </div>
);

export const ReplyHeader = ({ agent, model, seconds, busy }: { agent: string; model: string; seconds?: number; busy: boolean }) => (
  <div className="flex items-center gap-1.5 text-[12px] leading-[1.3]" title={`${agent} · ${modelName(model)}`}>
    <Logo className="size-5" />
    {seconds != null && <span className="text-ink-3 tabular-nums">{busy ? "working" : "for"} {seconds}s</span>}
  </div>
);
