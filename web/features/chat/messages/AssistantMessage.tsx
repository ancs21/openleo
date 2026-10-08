import { useEffect, useState, type ReactNode } from "react";
import type { Message, ToolPart } from "../useAgent";
import { ReplyFooter } from "./ReplyFooter";
import { ReplyHeader, StreamingText } from "./StreamingText";
import { Thinking } from "./Thinking";
import { ToolRun } from "./ToolRun";

/** Pages the agent searched or read in this reply (search results first, then fetched pages), deduplicated. */
function sourcesOf(parts: Message["parts"]) {
  const urls = parts.flatMap((p) => {
    if (p.type !== "dynamic-tool" || p.state !== "output-available") return [];
    const a = (p.input ?? {}) as { url?: string; sources?: { url?: string }[] };
    if (p.toolName === "web_search") return (a.sources ?? []).map((s) => s.url ?? "");
    if (p.toolName === "fetch_url") return [a.url ?? ""];
    return [];
  });
  return [...new Set(urls.filter((u) => /^https?:\/\//.test(u)))];
}

/** Render one assistant message: consecutive tool parts become one ToolRun; the footer shows once it's done. */
export function AssistantMessage({ m, streaming, agent, model, onRetry }: { m: Message; streaming: boolean; agent: string; model: string; onRetry?: () => void }) {
  const [, tick] = useState(0);
  useEffect(() => { if (!streaming) return; const id = setInterval(() => tick((n) => n + 1), 1000); return () => clearInterval(id); }, [streaming]);
  const seconds = m.startedAt ? Math.max(1, Math.round(((m.endedAt ?? Date.now()) - m.startedAt) / 1000)) : undefined;
  const out: ReactNode[] = [];
  let run: ToolPart[] = [];
  const flush = () => { if (run.length) out.push(<ToolRun key={`run-${out.length}`} parts={run} />); run = []; };
  m.parts.forEach((p, i) => {
    if (p.type === "dynamic-tool") return void run.push(p);
    flush();
    const last = streaming && i === m.parts.length - 1;
    if (p.type === "reasoning") out.push(<Thinking key={i} text={p.text} active={last} />);
    else if (p.type === "text" && p.text) out.push(<StreamingText key={i} text={p.text} active={last} />);
  });
  flush();
  return (
    <div className="flex flex-col gap-2 animate-fade-up">
      <ReplyHeader agent={agent} model={model} seconds={seconds} busy={streaming} />
      {out}
      {!streaming && <ReplyFooter text={m.parts.flatMap((p) => (p.type === "text" ? [p.text] : [])).join("\n\n")} sources={sourcesOf(m.parts)} onRetry={onRetry} />}
    </div>
  );
}
