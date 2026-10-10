import { useState } from "react";
import type { TaskCard } from "../../../shared/types";
import { taskAgents } from "../../../shared/types";
import { Icon, glyphs } from "../../components/Icon";
import { Select } from "../../components/Select";
import { timeAgo } from "../../lib/format";
import { useApp } from "../../stores/app-store";
import { AgentIcon } from "../../components/AgentIcon";
import { FieldValue } from "./CardFields";
import { StatusPill } from "./CardView";
import { ListIcon } from "./ListColumn";
import { useBoard } from "./store";

const ALL = "";
const cellLine = "border-r border-line last:border-r-0";
const head = `${cellLine} flex min-w-0 items-center px-3 py-2`;
const body = `${cellLine} flex min-w-0 items-center px-3 py-1.5`;
const EASE = "cubic-bezier(0.23, 1, 0.32, 1)";

export function BoardTable({ matches, onOpenTask }: { matches: (c: TaskCard) => boolean; onOpenTask: (id: string) => void }) {
  const { board, moveCard, addTask } = useBoard();
  const agents = useApp((s) => s.agents);
  const [list, setList] = useState(ALL);
  if (!board) return null;
  const fields = board.fields ?? [];
  const listOf = new Map(board.lists.flatMap((l) => l.cards.map((id) => [id, l] as const)));
  const rows = board.lists.flatMap((l) => l.cards.map((id) => board.cards[id]).filter((c): c is TaskCard => !!c));
  const shown = (c: TaskCard) => (list === ALL || listOf.get(c.id)?.id === list) && matches(c);
  const columns = `minmax(240px,1.6fr) 150px 112px 96px ${fields.map(() => "minmax(150px,1fr)").join(" ")} 104px`;
  const listOptions = board.lists.map((l) => ({ value: l.id, label: l.title, icon: <ListIcon icon={l.icon} className="size-3" /> }));
  const target = list || board.lists[0]?.id;

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-2">
      <div className="flex w-fit max-w-full items-center gap-1 overflow-x-auto rounded-full bg-surface/80 p-1 shadow-btn backdrop-blur-xl" style={{ scrollbarWidth: "none" }}>
        {[{ id: ALL, title: "All", icon: undefined, count: rows.length }, ...board.lists.map((l) => ({ id: l.id, title: l.title, icon: l.icon, count: l.cards.length }))].map((f) => {
          const active = list === f.id;
          return (
            <button key={f.id || "all"} type="button" aria-pressed={active} onClick={() => setList(f.id)}
              className={`flex h-6.5 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-medium transition-[background-color,box-shadow,color] duration-200 ${active ? "bg-surface text-ink shadow-btn" : "text-ink-2 hover:bg-hover"}`}>
              {f.id && <ListIcon icon={f.icon} className="size-3" />}
              {f.title}
              <span className={`rounded-[4px] px-1 text-[10.5px] tabular-nums ${active ? "bg-field text-ink-2" : "text-ink-3"}`}>{f.count}</span>
            </button>
          );
        })}
      </div>

      <div role="region" aria-label="Cards" tabIndex={0} className="overflow-x-auto rounded-card bg-surface shadow-card">
        <div className="w-max min-w-full">
          <div className="grid border-b border-line text-[12.5px] font-medium text-ink-2" style={{ gridTemplateColumns: columns }}>
            <span className={head}>Task</span>
            <span className={head}>List</span>
            <span className={head}>Status</span>
            <span className={head}>Agents</span>
            {fields.map((f) => <span key={f.id} className={head}><span className="truncate">{f.name}</span></span>)}
            <span className={head}>Last run</span>
          </div>
          {rows.map((c) => {
            const on = shown(c);
            const home = listOf.get(c.id)!;
            return (
              // Rows fold away (not vanish) when a chip or the search hides them.
              <div key={c.id} className="grid transition-[grid-template-rows,opacity] duration-300"
                style={{ gridTemplateRows: on ? "1fr" : "0fr", opacity: on ? 1 : 0, transitionTimingFunction: EASE }} inert={!on}>
                <div className="overflow-hidden">
                  <div className="grid border-b border-line text-[13px] transition-colors duration-100 hover:bg-hover" style={{ gridTemplateColumns: columns }}>
                    <span className={body}>
                      <button type="button" onClick={() => onOpenTask(c.id)} title="Open the card" className="flex min-w-0 items-baseline gap-1.5 text-left">
                        <span className="shrink-0 text-[12px] text-ink-3 tabular-nums">#{c.num}</span>
                        <span className="truncate font-medium text-ink hover:underline">{c.title}</span>
                      </button>
                    </span>
                    <span className={`${body} px-1`}>
                      <Select bare label={`List of #${c.num}`} value={home.id} options={listOptions}
                        onChange={(to) => { if (to !== home.id) moveCard(c.id, to, board.lists.find((l) => l.id === to)!.cards.length); }} />
                    </span>
                    <span className={body}><StatusPill status={c.status} /></span>
                    <span className={`${body} gap-1`}>
                      {taskAgents(c).map((name) => (
                        <span key={name} title={name} className="flex size-5.5 items-center justify-center rounded-[6px] bg-field text-ink-2 shadow-hairline">
                          <AgentIcon icon={agents.find((a) => a.name === name)?.icon} className="size-3" />
                        </span>
                      ))}
                    </span>
                    {fields.map((f) => <span key={f.id} className={`${body} px-1`}><FieldValue bare card={c} field={f} /></span>)}
                    <span className={`${body} whitespace-nowrap text-ink-2 tabular-nums`}>{c.ranAt ? timeAgo(c.ranAt) : "—"}</span>
                  </div>
                </div>
              </div>
            );
          })}
          {target && (
            <div className="flex items-center gap-2 px-3 text-ink-3">
              <Icon size={13}>{glyphs.plus}</Icon>
              <input aria-label="New task" placeholder={`New task in ${board.lists.find((l) => l.id === target)!.title}`}
                onKeyDown={(e) => { const v = e.currentTarget.value.trim(); if (e.key === "Enter" && v) { addTask(target, v); e.currentTarget.value = ""; } }}
                className="h-10 min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-3" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
