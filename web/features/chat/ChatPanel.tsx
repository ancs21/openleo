import { useEffect, useRef, useState } from "react";
import type { Effort, Tuning } from "../../../shared/types";
import { Button } from "../../components/Button";
import { Icon, glyphs } from "../../components/Icon";
import { IconButton } from "../../components/IconButton";
import { ComputerBoard, Markdown } from "../../components/Markdown";
import { Shimmer } from "../../components/motion";
import { play } from "../../lib/sounds";
import { storage } from "../../lib/storage";
import { USAGE_URL, isPlanModel, useApp } from "../../stores/app-store";
import AgentScreen from "../sandbox/AgentScreen";
import { AssistantMessage } from "./messages/AssistantMessage";
import { Working } from "./messages/Thinking";
import { UserBubble } from "./messages/UserBubble";
import PromptBar, { type Command } from "./PromptBar";
import { useAgent, type Message } from "./useAgent";

const idleGap = (m?: Message) => {
  const last = m?.parts.at(-1);
  return !last || (last.type === "dynamic-tool" && last.state !== "input-available");
};

/** Older turns were compacted into this summary; expand to read it. */
function SummaryDivider({ text }: { text: string }) {
  return (
    <details className="group text-[12.5px] text-ink-3">
      <summary className="flex cursor-pointer list-none items-center gap-3 select-none hover:text-ink-2">
        <span className="h-px flex-1 bg-line" />Earlier messages summarized<span className="h-px flex-1 bg-line" />
      </summary>
      <div className="mt-2 rounded-card bg-field px-3 py-2.5 text-[13px] text-ink-2"><Markdown text={text} /></div>
    </details>
  );
}

/** Chat with one agent in one conversation (addressed by url). */
export function ChatPanel({ agent, url, onNew, compact = false, emptyText, board = "main", assistant, placeholder }: {
  agent: string; url: string; onNew: () => void;
  /** a built-in assistant (Leo): its model is kept apart from the user's agents, and it has no computer */
  assistant?: { model: string; effort?: Effort; tune: (patch: Tuning) => void };
  placeholder?: string;
  /** the board this chat works on: its computer is the one shown and used */
  board?: string;
  /** embedded use (card panel): no header, no agent screen, transparent background */
  compact?: boolean;
  emptyText?: string;
}) {
  const def = useApp((s) => s.agents.find((a) => a.name === agent));
  const allAgents = useApp((s) => s.agents);
  const models = useApp((s) => s.models);
  const box = useApp((s) => s.sandbox);
  const signedIn = useApp((s) => s.chatgpt.signedIn);
  const { tuneAgent, setLimitOpen, openViewer: openDesktop } = useApp.getState();
  const model = assistant?.model ?? def?.model ?? "";
  const effort = assistant ? assistant.effort : def?.effort;
  const tune = (patch: Tuning) => (assistant ? assistant.tune(patch) : void tuneAgent(agent, patch));
  const hasComputer = !!box?.sandboxed && !assistant; // every agent can use its board's computer (a built-in assistant has none)
  const usingPlan = isPlanModel(model, signedIn);
  const subagents = allAgents.filter((a) => def?.subagents.includes(a.name)).map((a) => ({ name: a.name, description: a.description }));
  const { messages, status, error, historyReady, sendMessage, stop, compact: compactHistory } = useAgent({ url });
  const busy = status === "submitted" || status === "streaming";
  // The computer tray above the composer can be folded away for more room (remembered per browser).
  const [trayHidden, setTrayHiddenState] = useState(() => storage.get("computer-tray") === "hidden");
  const setTrayHidden = (hidden: boolean) => { setTrayHiddenState(hidden); storage.set("computer-tray", hidden ? "hidden" : "shown"); };
  // "Ask again" sends the question that started the latest reply once more (with its images).
  const retryOf = (before: typeof messages) => {
    const q = before.findLast((x) => x.role === "user" && x.kind !== "summary");
    const text = q?.parts.find((p) => p.type === "text")?.text;
    return text ? () => void sendMessage(text, q!.parts.flatMap((p) => (p.type === "file" ? [p.url] : []))) : undefined;
  };
  const commands: Command[] = [
    { key: "new", name: "/new", desc: "Start a new chat", run: onNew },
    ...(busy ? [{ key: "stop", name: "/stop", desc: "Stop the current run", run: () => void stop() }] : []), // only while there's a run to stop
    ...(box?.sandboxed ? [{ key: "desktop", name: "/desktop", desc: "Open the sandbox desktop", run: () => void openDesktop(board) }] : []),
    { key: "compact", name: "/compact", desc: "Summarize older messages to free up space", run: () => void compactHistory() },
    { key: "summarize", name: "/summarize", desc: "Digest the conversation so far", insert: "Summarize our conversation so far in a few bullets." },
    { key: "plan", name: "/plan", desc: "Plan before acting", insert: "Before doing anything, write a short step-by-step plan, then carry it out: " },
    ...(hasComputer ? [{ key: "look", name: "/look", desc: "Describe the desktop", insert: "Take a screenshot and describe what's on the desktop." }] : []),
  ];
  // Follow the reply as it streams, but only while you're at the bottom: scrolling up to read stops it,
  // scrolling back down (or sending a message) starts it again. Only the chat scrolls, never the page.
  const scroller = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  const count = useRef(0);
  const onScroll = () => {
    const el = scroller.current;
    if (el) pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };
  useEffect(() => {
    if (messages.length > count.current) pinned.current = true; // a new message: jump to it
    count.current = messages.length;
    const el = scroller.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  }, [messages]);
  useEffect(() => { if (error && /subscription_sharing_usage_(limit_exceeded|unavailable)/.test(error)) setLimitOpen(true); }, [error, setLimitOpen]);
  // Sound the end of a run: soft "page" when the reply lands, "release" on error.
  const wasBusy = useRef(false);
  useEffect(() => {
    if (wasBusy.current && !busy) play(status === "error" ? "release" : "page");
    wasBusy.current = busy;
  }, [busy, status]);

  const composer = (
    <PromptBar placeholder={placeholder ?? `Message ${agent}…  @ to attach or mention · / for commands`} busy={busy}
      onSend={sendMessage} onStop={stop} subagents={subagents} commands={commands}
      models={models.includes(model) ? models : [model, ...models]} model={model} onModel={(m) => tune({ model: m })}
      effort={effort} onEffort={def || assistant ? (e) => tune({ effort: e }) : undefined} isFlagship={(m) => isPlanModel(m, signedIn)}
      footer={usingPlan
        ? <>Using ChatGPT plan · <a className="text-accent-ink hover:underline" href={USAGE_URL} target="_blank" rel="noopener">Manage usage</a></>
        : undefined} />
  );

  return (
    <ComputerBoard.Provider value={box?.sandboxed ? board : undefined}>
    <section className={compact ? "flex min-h-0 flex-1 flex-col" : "flex min-h-0 flex-col border-l border-line bg-surface max-lg:min-h-[70vh] max-lg:border-t max-lg:border-l-0"}>
      {!compact && <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line px-4">
        <span className="text-[13.5px] font-semibold">{agent}</span>
        <span className="truncate rounded-chip bg-field px-1.5 py-0.5 font-mono text-[11px] text-ink-2 shadow-hairline">{model}</span>
        <span className="flex-1" />
        {box?.sandboxed && (
          <Button className="h-7 px-2 text-[12.5px]" onClick={() => void openDesktop(board)} title={`Live view of this board's ${box.on} computer`}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /></svg>
            Desktop{box.on === "cloud" && <span className="text-ink-3">· cloud</span>}
          </Button>
        )}
        <Button className="h-7 px-2 text-[12.5px]" onClick={onNew} disabled={busy}>New chat</Button>
      </header>}
      <div ref={scroller} onScroll={onScroll} className={`flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto ${compact ? "py-4" : "px-4 py-4"}`} aria-live="polite">
        {historyReady && !messages.length && <p className="m-auto text-[13px] text-ink-3">{emptyText ?? `Message ${agent} to start.`}</p>}
        {messages.map((m, i) => m.kind === "summary"
          ? <SummaryDivider key={m.id} text={m.parts[0]?.type === "text" ? m.parts[0].text : ""} />
          : m.role === "user"
          ? <UserBubble key={m.id} text={m.parts[0]?.type === "text" ? m.parts[0].text : ""} images={m.parts.flatMap((p) => (p.type === "file" ? [p.url] : []))} />
          : <AssistantMessage key={m.id} m={m} streaming={busy && i === messages.length - 1} agent={agent} model={model}
              onRetry={!busy && i === messages.length - 1 ? retryOf(messages.slice(0, i)) : undefined} />)}
        {busy && idleGap(messages.at(-1)) && <Working />}
        {error && <div className="rounded-control bg-red-tint px-3 py-2 text-[12.5px] break-words text-red">{error}</div>}
      </div>
      <div className={compact ? "shrink-0 pb-1" : "shrink-0 p-3 pt-0"}>
        {hasComputer && !trayHidden ? (
          // Computer tray: the agent's computer sits on top of the composer, its thumbnail poking above the edge.
          <div className="mt-8 rounded-[18px] border border-line bg-canvas p-1.5 pt-0">
            <div className="flex items-end gap-1 px-2 pb-2">
              <AgentScreen variant="dock" agentName={agent} board={board} onInteract={() => void openDesktop(board)}
                status={busy
                  ? <><span className="size-2.5 animate-pulse-dot rounded-full bg-accent" /><Shimmer>Working</Shimmer></>
                  : <span className="text-[13px] font-normal text-ink-3">{agent}'s computer · click to take over</span>}
                onTeach={(frames, secs) => sendMessage(
                  `I just demonstrated a task on your desktop (${secs}s, ${frames.length} keyframes attached in order). ` +
                  "Study the frames, list the steps I took, and be ready to repeat it on the desktop when I ask.", frames)} />
              <span className="flex-1" />
              <IconButton size="sm" aria-label="Hide computer" title="Hide computer" onClick={() => setTrayHidden(true)}><Icon size={13}>{glyphs.chevron}</Icon></IconButton>
            </div>
            {composer}
          </div>
        ) : hasComputer ? <>
          <button type="button" onClick={() => setTrayHidden(false)} className="mb-1 ml-auto flex h-6 items-center gap-1 rounded-[6px] px-1.5 text-[12px] text-ink-3 hover:bg-hover hover:text-ink">
            <Icon size={12}>{glyphs.monitor}</Icon>Show computer
          </button>
          {composer}
        </> : composer}
      </div>
    </section>
    </ComputerBoard.Provider>
  );
}
