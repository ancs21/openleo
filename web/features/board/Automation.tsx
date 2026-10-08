import { useState } from "react";
import { agentLabel } from "../../../shared/types";
import { describeSchedule, type Schedule } from "../../../shared/schedule";
import type { TaskCard } from "../../../shared/types";
import { Button } from "../../components/Button";
import { Dialog } from "../../components/Dialog";
import { Icon, glyphs } from "../../components/Icon";
import { Select } from "../../components/Select";
import { Switch } from "../../components/Switch";
import { useApp } from "../../stores/app-store";
import { AgentIcon } from "../../components/AgentIcon";
import { localZone, REPEATS, repeatOf, TIMES, WEEKDAYS, when, withRepeat } from "./CardSchedule";
import { useBoard } from "./store";

const NOBODY = "";
const section = "flex flex-col gap-2";
const heading = "text-[13.5px] font-semibold text-ink";
const hint = "text-[12.5px] text-ink-3";
const row = "flex min-h-11 items-center gap-3 rounded-card border border-line px-3 py-2";

/** A list's automation: who picks up new cards added to it, and which of its cards repeat. */
export function Automation({ listId, onOpenTask }: { listId: string; onOpenTask: (id: string) => void }) {
  const { board, setListAgent, editTask, setAutomationList } = useBoard();
  const agents = useApp((s) => s.agents);
  const [adding, setAdding] = useState(false);
  const list = board?.lists.find((l) => l.id === listId);
  if (!board || !list) return null;
  const close = () => setAutomationList(undefined);
  const cards = list.cards.map((id) => board.cards[id]).filter((c): c is TaskCard => !!c);
  const agentOptions = [
    { value: NOBODY, label: "Nothing happens", icon: <Icon size={13} className="shrink-0 text-ink-3">{glyphs.off}</Icon> },
    ...agents.map((a) => ({ value: a.name, label: `${agentLabel(a)} works on it`, icon: <AgentIcon icon={a.icon} /> })),
  ];
  const scheduled = cards.filter((c): c is TaskCard & { schedule: Schedule } => !!c.schedule);
  const unscheduled = cards.filter((c) => !c.schedule);

  return (
    <Dialog title={`Automation · ${list.title}`} onClose={close} className="w-[min(640px,calc(100vw-32px))]">
      <div className="flex min-h-0 flex-col gap-6 overflow-y-auto pb-1">
        <section className={section}>
          <div>
            <h3 className={heading}>When a card is added</h3>
            <p className={hint}>Every new card in {list.title} goes straight to this agent.</p>
          </div>
          <Select label={`When a card is added to ${list.title}`} value={list.agent ?? NOBODY} options={agentOptions}
            onChange={(agent) => setListAgent(list.id, agent || undefined)} />
        </section>

        <section className={section}>
          <div className="flex items-end justify-between gap-3">
            <div>
              <h3 className={heading}>On a schedule</h3>
              <p className={hint}>Cards in {list.title} that their agent runs again on a repeat. They run while this computer is on.</p>
            </div>
            {!adding && unscheduled.length > 0 && agents.length > 0 && (
              <Button type="button" className="shrink-0 gap-1" onClick={() => setAdding(true)}><Icon size={12}>{glyphs.plus}</Icon>Repeat a card</Button>
            )}
          </div>
          {adding && <NewSchedule cards={unscheduled} onDone={() => setAdding(false)} />}
          {scheduled.map((c) => {
            const s = c.schedule, on = !s.paused;
            const icon = agents.find((a) => a.name === s.agent)?.icon;
            return (
              <div key={c.id} className={row}>
                <AgentIcon icon={icon} className="size-4 text-ink-2" />
                <button type="button" onClick={() => { close(); onOpenTask(c.id); }} className="min-w-0 flex-1 text-left" title="Open the card">
                  <div className="truncate text-[13.5px] font-medium hover:underline">#{c.num} {c.title}</div>
                  <div className="truncate text-[12px] text-ink-3">
                    {s.agent} · {describeSchedule(s)}{on && c.nextRunAt ? ` · next ${when(c.nextRunAt)}` : (c.failStreak ?? 0) >= 3 ? " · paused after 3 failed runs" : " · paused"}
                  </div>
                </button>
                <Switch label={`Repeat #${c.num}`} checked={on} onChange={() => editTask(c.id, { schedule: { ...s, paused: on ? true : undefined } })} />
              </div>
            );
          })}
          {!scheduled.length && !adding && <p className={hint}>{!cards.length ? "No cards in this list yet." : agents.length ? "No cards repeat yet." : "Create an agent first."}</p>}
        </section>
      </div>
    </Dialog>
  );
}

/** Pick a card, its agent and when: the card then repeats (it can be fine-tuned in its agent tab). */
function NewSchedule({ cards, onDone }: { cards: TaskCard[]; onDone: () => void }) {
  const editTask = useBoard((s) => s.editTask);
  const agents = useApp((s) => s.agents);
  const [cardId, setCardId] = useState(cards[0]!.id);
  const [schedule, setSchedule] = useState<Schedule>({ agent: cards[0]!.agent ?? agents[0]!.name, zone: localZone(), at: "09:00", days: WEEKDAYS });
  return (
    <div className="flex flex-col gap-2.5 rounded-card border border-line bg-surface p-3">
      <div className="grid grid-cols-[72px_1fr] items-center gap-x-3 gap-y-2 text-[12.5px] text-ink-2">
        <span>Card</span>
        <Select label="Card" value={cardId} onChange={setCardId} options={cards.map((c) => ({ value: c.id, label: `#${c.num} ${c.title}` }))} />
        <span>Agent</span>
        <Select label="Agent" value={schedule.agent} onChange={(agent) => setSchedule({ ...schedule, agent })} options={agents.map((a) => ({ value: a.name, label: a.name, icon: <AgentIcon icon={a.icon} /> }))} />
        <span>Repeat</span>
        <div className="flex gap-2">
          <Select label="Repeat" className="flex-1" value={repeatOf(schedule)} onChange={(r) => setSchedule(withRepeat(schedule, r))} options={REPEATS} />
          {"at" in schedule && <Select label="Time" className="w-28" value={schedule.at} onChange={(at) => setSchedule({ ...schedule, at })} options={TIMES.map((t) => ({ value: t, label: t }))} />}
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" onClick={onDone}>Cancel</Button>
        <Button type="button" variant="primary" onClick={() => { editTask(cardId, { schedule }); onDone(); }}>Repeat it</Button>
      </div>
    </div>
  );
}
