// Card panel: slides in from the right over the board, with no backdrop.
import { usePanels } from "../../stores/panels";
import { agentsUrl } from "../../stores/app-store";
import { useEffect, useState, type ReactNode } from "react";
import { agentLabel, taskAgents, type AgentDef, type TaskCard } from "../../../shared/types";
import { fieldClass } from "../../components/field";
import { Icon, glyphs } from "../../components/Icon";
import { IconButton } from "../../components/IconButton";
import { Markdown } from "../../components/Markdown";
import { Shimmer } from "../../components/motion";
import { MenuItem, Popover } from "../../components/Popover";
import { Confirm } from "../../components/Modal";
import { timeAgo } from "../../lib/format";
import { useEscape } from "../../lib/hooks";
import { StatusPill } from "./CardView";
import { useBoard } from "./store";
import { ChatPanel } from "../chat/ChatPanel";
import { AgentIcon } from "../../components/AgentIcon";
import { CardSchedule } from "./CardSchedule";
import { AddField, CardField } from "./CardFields";
import { PanelResizer } from "../../components/PanelResizer";
import { TabButton } from "../../components/TabButton";

/** `offset`: px taken by a panel to its right (Leo), so it sits beside it. */
export function CardPanel({ card, agents, onClose, offset = 0 }: { card: TaskCard; agents: AgentDef[]; onClose: () => void; offset?: number }) {
  const [tab, setTab] = useState<string>("general"); // "general" or an agent's name
  const [wide, setWide] = useState(false);
  const width = usePanels((s) => s.panelWidth.card);
  const run = useBoard((s) => s.run);
  // One tab per agent that has worked on this task (deleted agents drop out).
  const tabs = taskAgents(card).filter((n) => agents.some((a) => a.name === n));
  const iconOf = (name: string) => agents.find((a) => a.name === name)?.icon;
  const labelOf = (name: string) => { const a = agents.find((x) => x.name === name); return a ? agentLabel(a) : name; };

  useEscape(onClose, { ignoreFields: true });
  useEffect(() => setTab("general"), [card.id]);

  return (
    <aside role="dialog" aria-label={`Task #${card.num}`}
      style={{ right: 12 + offset, width: wide ? `calc(100% - ${24 + offset}px)` : `min(${width}px, calc(100% - ${24 + offset}px))` }}
      className="absolute top-14 bottom-3 z-30 flex flex-col overflow-hidden rounded-[14px] bg-surface shadow-overlay animate-slide-in-right">
      {!wide && <PanelResizer panel="card" offset={offset} />}
      <div className="shrink-0 px-5 pt-4">
        <div className="flex items-center gap-1">
          <span className="text-[13px] text-ink-3 tabular-nums">#{card.num}</span>
          <span className="flex-1" />
          <ListPicker cardId={card.id} />
          <IconButton aria-label={wide ? "Collapse" : "Expand"} title={wide ? "Collapse" : "Expand"} onClick={() => setWide((w) => !w)}>
            <Icon size={15}>{wide ? glyphs.collapse : glyphs.expand}</Icon>
          </IconButton>
          <IconButton aria-label="Close" onClick={onClose}><Icon size={16}>{glyphs.close}</Icon></IconButton>
        </div>
        <Title card={card} />
        <div role="tablist" className="mt-3 flex items-center gap-5 border-b border-line">
          <TabButton active={tab === "general"} onClick={() => setTab("general")}>General</TabButton>
          {tabs.map((name) => (
            <TabButton key={name} active={tab === name} onClick={() => setTab(name)}>
              <AgentIcon icon={iconOf(name)} />{labelOf(name)}
              {card.status === "running" && card.agent === name && <span className="size-1.5 rounded-full bg-accent animate-pulse-dot" />}
            </TabButton>
          ))}
          <AgentChooser agents={agents} current={tab === "general" ? undefined : tab} onPick={(name) => {
            setTab(name);
            // A new agent on this task gets it to work; one that already has a tab just opens.
            if (card.status !== "running" && !tabs.includes(name)) void run(card.id, name);
          }} />
        </div>
      </div>

      <div className={`min-h-0 flex-1 px-5 ${tab === "general" ? "overflow-y-auto pb-5" : "flex flex-col pb-3"}`}>
        {tab === "general" ? <GeneralTab card={card} onClose={onClose} onRun={() => setTab(card.agent ?? "general")} /> : <AgentTab card={card} agent={tab} />}
      </div>
    </aside>
  );
}

function AgentChooser({ agents, current, onPick }: { agents: AgentDef[]; current?: string; onPick: (name: string) => void }) {
  const [open, setOpen] = useState(false);
  const boardId = useBoard((s) => s.boardId);
  return (
    <Popover open={open} onClose={() => setOpen(false)} align="left" className="w-56" trigger={
      <button type="button" aria-label="Choose an agent" title="Choose an agent" aria-expanded={open} onClick={() => setOpen((o) => !o)}
        className={`flex size-7 items-center justify-center rounded-control text-ink-2 transition-colors duration-100 hover:bg-hover-2 hover:text-ink ${open ? "bg-hover-2 text-ink" : "bg-hover"}`}>
        <Icon size={14}>{glyphs.plus}</Icon>
      </button>
    }>
      {agents.length
        ? agents.map((a) => <MenuItem key={a.name} icon={<AgentIcon icon={a.icon} />} checked={a.name === current} onClick={() => { onPick(a.name); setOpen(false); }}>{a.name}</MenuItem>)
        : <MenuItem to={`/b/${boardId}/agents/new`}>Create an agent first</MenuItem>}
    </Popover>
  );
}

function Title({ card }: { card: TaskCard }) {
  const editTask = useBoard((s) => s.editTask);
  return (
    <textarea key={card.id} defaultValue={card.title} aria-label="Task title" rows={1}
      onBlur={(e) => editTask(card.id, { title: e.target.value.trim() || card.title })}
      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } }}
      className="-mx-1.5 mt-0.5 w-[calc(100%+12px)] resize-none rounded-[8px] bg-transparent px-1.5 py-0.5 text-[19px] leading-snug font-semibold text-ink outline-none [field-sizing:content] hover:bg-hover focus:bg-field" />
  );
}

function ListPicker({ cardId }: { cardId: string }) {
  const lists = useBoard((s) => s.board?.lists ?? []);
  const moveCard = useBoard((s) => s.moveCard);
  const [open, setOpen] = useState(false);
  const current = lists.find((l) => l.cards.includes(cardId));
  return (
    <Popover open={open} onClose={() => setOpen(false)} trigger={
      <button type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}
        className="flex h-8 items-center gap-1 rounded-[8px] px-2 text-[13px] font-medium text-ink transition-colors duration-100 hover:bg-hover">
        {current?.title ?? "No list"}<span className="text-ink-3"><Icon size={12} strokeWidth={2.4}>{glyphs.chevron}</Icon></span>
      </button>
    }>
      {lists.map((l) => (
        <MenuItem key={l.id} checked={l.id === current?.id} onClick={() => { if (l.id !== current?.id) moveCard(cardId, l.id, 0); setOpen(false); }}>
          {l.title}
        </MenuItem>
      ))}
    </Popover>
  );
}

function Section({ title, info, action, children }: { title: string; info?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="border-b border-line py-4 last:border-b-0">
      <div className="mb-2.5 flex items-center gap-1.5">
        <h3 className="text-[14px] font-semibold text-ink">{title}</h3>
        {info && <span title={info} className="flex size-4 items-center justify-center rounded-full bg-ink-3 text-[10px] font-bold text-surface">i</span>}
        <span className="flex-1" />
        {action}
      </div>
      {children}
    </section>
  );
}

function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <span className="flex items-center gap-1.5 text-[13px] text-ink-2">
      <Icon size={13}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M7 9h6M7 13h10" /></Icon>{children}
    </span>
  );
}

const textBtn = "h-7 rounded-[7px] px-2 text-[13px] font-medium text-ink transition-colors duration-100 hover:bg-hover";

function GeneralTab({ card, onClose, onRun }: { card: TaskCard; onClose: () => void; onRun: () => void }) {
  const { editTask, deleteCard, run } = useBoard();
  const [confirming, setConfirming] = useState(false);
  const list = useBoard((s) => s.board?.lists.find((l) => l.cards.includes(card.id)));
  const fields = useBoard((s) => s.board?.fields);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(card.notes);
  useEffect(() => { setDraft(card.notes); setEditing(false); }, [card.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <Section title="Fields" action={<AddField className={textBtn} />}>
        <div className="grid grid-cols-2 gap-x-6 gap-y-3 max-sm:grid-cols-1">
          <div className="flex flex-col gap-1"><FieldLabel>Status</FieldLabel><StatusPill status={card.status} /></div>
          <div className="flex flex-col gap-1"><FieldLabel>Agent</FieldLabel>
            {card.agent ? <span className="inline-flex h-5.5 w-fit items-center rounded-[6px] bg-accent-tint px-1.5 text-[11.5px] font-medium text-accent-ink">{card.agent}</span>
              : <span className="text-[13px] text-ink-3">Not started. Choose an agent with + to start it.</span>}
          </div>
          <div className="flex flex-col gap-1"><FieldLabel>List</FieldLabel><span className="text-[13px] text-ink">{list?.title ?? "—"}</span></div>
          <div className="flex flex-col gap-1"><FieldLabel>Last run</FieldLabel><span className="text-[13px] text-ink">{timeAgo(card.ranAt)}</span></div>
          {fields?.map((f) => <CardField key={f.id} card={card} field={f} />)}
        </div>
      </Section>

      <Section title="Content" info="What the agent receives: the title, then these details."
        action={editing ? null : <button type="button" onClick={() => setEditing(true)} className={textBtn}>Edit</button>}>
        {editing ? (
          <div className="flex flex-col gap-2">
            <textarea autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} rows={6} placeholder="Details, context, acceptance criteria… (markdown)"
              onKeyDown={(e) => { if (e.key === "Escape") { setDraft(card.notes); setEditing(false); } }}
              className={`${fieldClass} w-full resize-y px-3 py-2 leading-relaxed`} />
            <div className="flex gap-2">
              <button type="button" onClick={() => { editTask(card.id, { notes: draft }); setEditing(false); }} className="h-7 rounded-[7px] bg-ink px-3 text-[13px] font-medium text-surface hover:opacity-90">Save</button>
              <button type="button" onClick={() => { setDraft(card.notes); setEditing(false); }} className={textBtn}>Cancel</button>
            </div>
          </div>
        ) : card.notes.trim() ? <Markdown text={card.notes} />
          : <button type="button" onClick={() => setEditing(true)} className="text-left text-[13.5px] text-ink-3 hover:text-ink-2">Add details for the agent…</button>}
      </Section>

      {(card.result || card.status === "running") && (
        <Section title="Result" action={card.agent && card.status !== "running" ? (
          <span className="flex gap-1">
            {/* A failed run: send the task to the same agent again, in the same chat. */}
            {card.status === "error" && <button type="button" onClick={() => { void run(card.id, card.agent!); onRun(); }} className={textBtn}>Try again</button>}
            <button type="button" onClick={onRun} className={textBtn}>Open</button>
          </span>
        ) : null}>
          <Result card={card} />
        </Section>
      )}

      <Section title="Danger zone">
        <button type="button" onClick={() => setConfirming(true)} className="h-8 rounded-[8px] px-2.5 text-[13px] font-medium text-red hover:bg-red-tint">Delete task</button>
        <Confirm open={confirming} onClose={() => setConfirming(false)} title={`Delete task #${card.num}?`} confirmLabel="Delete task"
          message="Its result and chat go with it. This can't be undone." onConfirm={() => { deleteCard(card.id); onClose(); }} />
      </Section>
    </>
  );
}

function Result({ card }: { card: TaskCard }) {
  if (card.status === "running") return <Shimmer className="text-[13.5px]">{`${card.agent} is working on it…`}</Shimmer>;
  if (card.status === "error") return <p className="text-[13.5px] text-red">{card.result}</p>;
  return <Markdown text={card.result ?? ""} />;
}

/** The agent tab is the task's real conversation ("task-<id>"): the run, then follow-ups in place. */
function AgentTab({ card, agent }: { card: TaskCard; agent: string }) {
  const boardId = useBoard((s) => s.boardId);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <CardSchedule card={card} agent={agent} />
      {/* Remount on each run/status change so the finished run's history loads. */}
      <ChatPanel key={`${card.id}-${agent}-${card.ranAt ?? 0}-${card.status}`} compact agent={agent}
        url={`${agentsUrl(boardId)}/${agent}/task-${card.id}`} onNew={() => {}} board={boardId}
        emptyText={card.status === "running" ? "Working…" : `Message ${agent} about this task.`} />
    </div>
  );
}
