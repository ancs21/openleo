import { useState } from "react";
import { describeSchedule, type Schedule } from "../../../shared/schedule";
import type { TaskCard, TaskRun } from "../../../shared/types";
import { Icon, glyphs } from "../../components/Icon";
import { Select } from "../../components/Select";
import { Switch } from "../../components/Switch";
import { useBoard } from "./store";

export type Repeat = "m5" | "m10" | "m15" | "m30" | "m60" | "m120" | "m240" | "m720" | "daily" | "weekdays" | "weekly" | "custom";
export const REPEATS: { value: Repeat; label: string }[] = [
  { value: "daily", label: "Every day" }, { value: "weekdays", label: "Weekdays" }, { value: "weekly", label: "Once a week" },
  { value: "custom", label: "On chosen days" }, { value: "m5", label: "Every 5 minutes" }, { value: "m10", label: "Every 10 minutes" }, { value: "m15", label: "Every 15 minutes" }, { value: "m30", label: "Every 30 minutes" },
  { value: "m60", label: "Every hour" }, { value: "m120", label: "Every 2 hours" }, { value: "m240", label: "Every 4 hours" }, { value: "m720", label: "Every 12 hours" },
];
const ALL = [0, 1, 2, 3, 4, 5, 6];
export const WEEKDAYS = [1, 2, 3, 4, 5];
const WEEK = [1, 2, 3, 4, 5, 6, 0]; // shown Monday first
const DAY_LETTERS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const TIMES = Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`);
export const localZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

export function repeatOf(s: Schedule): Repeat {
  if ("minutes" in s) return `m${s.minutes}` as Repeat;
  const key = s.days.join("");
  return key === "0123456" ? "daily" : key === "12345" ? "weekdays" : s.days.length === 1 ? "weekly" : "custom";
}

/** The schedule with a different repeat, keeping its time (and days, where they still fit). */
export function withRepeat(s: Schedule, r: Repeat): Schedule {
  const { agent, zone, paused } = s;
  const base = { agent, zone, ...(paused ? { paused } : {}) };
  if (r.startsWith("m")) return { ...base, minutes: Number(r.slice(1)) };
  const at = "at" in s ? s.at : "09:00";
  const days = "days" in s ? s.days : WEEKDAYS;
  return { ...base, at, days: r === "daily" ? ALL : r === "weekdays" ? WEEKDAYS : r === "weekly" ? [days[0] ?? 1] : days };
}

export const when = (t: number) => new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(t);
const STATUS: Record<TaskRun["status"], { label: string; cls: string }> = {
  done: { label: "Done", cls: "text-green" }, error: { label: "Failed", cls: "text-red" }, skipped: { label: "Skipped", cls: "text-ink-3" },
};
const HOW: Record<TaskRun["how"], string> = { manual: "by you", schedule: "on schedule", added: "when added" };

/** "Repeat" in a card's agent tab: run this card again on a schedule, and its recent runs. */
export function CardSchedule({ card, agent }: { card: TaskCard; agent: string }) {
  const editTask = useBoard((s) => s.editTask);
  const s = card.schedule;
  const [open, setOpen] = useState(false);
  if (s && s.agent !== agent) return null; // the schedule lives on the tab of the agent it runs
  const set = (schedule?: Schedule) => editTask(card.id, { schedule });
  const on = !!s && !s.paused;
  const toggle = () => {
    if (!s) { set({ agent, zone: localZone(), at: "09:00", days: WEEKDAYS }); setOpen(true); }
    else set({ ...s, paused: on ? true : undefined });
  };
  const stalled = s?.paused && (card.failStreak ?? 0) >= 3;
  const summary = !s ? "Off" : stalled ? "Paused after 3 failed runs" : s.paused ? `Paused · ${describeSchedule(s)}`
    : `${describeSchedule(s)}${card.nextRunAt ? ` · next ${when(card.nextRunAt)}` : ""}`;
  const runs = (card.runs ?? []).slice(-5).reverse();
  const repeat = s && repeatOf(s);

  return (
    <div className="shrink-0 border-b border-line py-1">
      <div className="flex min-h-7 items-center gap-2">
        <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="-ml-1 flex h-7 min-w-0 flex-1 items-center gap-1.5 rounded-[6px] px-1 text-left hover:bg-hover">
          <Icon size={13} className="shrink-0 text-ink-2">{glyphs.repeat}</Icon>
          <span className="text-[12.5px] font-medium text-ink">Repeat</span>
          <span className={`min-w-0 truncate text-[12.5px] ${stalled ? "text-red" : "text-ink-3"}`}>{summary}</span>
        </button>
        <Switch label="Run on a schedule" checked={on} onChange={toggle} />
      </div>
      {open && (
        <div className="flex flex-col gap-2.5 pt-1.5 pb-1 pl-6">
          {s ? <>
            <div className="flex flex-wrap items-center gap-2">
              <Select label="Repeat" className="w-44" value={repeat!} onChange={(r) => set(withRepeat(s, r))} options={REPEATS} />
              {"at" in s && <>
                <span className="text-[12.5px] text-ink-3">at</span>
                <Select label="Time" className="w-28" value={s.at} onChange={(at) => set({ ...s, at })} options={TIMES.map((t) => ({ value: t, label: t }))} />
              </>}
            </div>
            {"days" in s && (repeat === "weekly" || repeat === "custom") && (
              <div className="flex gap-1" role="group" aria-label="Days">
                {WEEK.map((d) => {
                  const picked = s.days.includes(d);
                  const days = repeat === "weekly" ? [d] : picked ? s.days.filter((x) => x !== d) : [...s.days, d].sort();
                  return (
                    <button key={d} type="button" aria-pressed={picked} disabled={picked && s.days.length === 1} onClick={() => set({ ...s, days })}
                      className={`h-7 w-10 rounded-control text-[12px] font-medium transition-colors duration-100 ${picked ? "bg-ink text-surface" : "bg-field text-ink-2 hover:bg-hover-2"}`}>
                      {DAY_LETTERS[d]}
                    </button>
                  );
                })}
              </div>
            )}
            <p className="text-[12px] text-ink-3">
              {agent} runs this card again each time, in the same chat. It runs while this computer is on; a run missed while it was off comes once when it's back.
              {s.zone !== localZone() && ` Times are in ${s.zone}.`}
            </p>
            <button type="button" onClick={() => { set(undefined); setOpen(false); }} className="w-fit text-[12.5px] font-medium text-ink-2 hover:text-red">Remove schedule</button>
          </> : <p className="text-[12.5px] text-ink-3">Switch it on to have {agent} run this card on a repeat.</p>}
          {runs.length > 0 && (
            <div className="flex flex-col gap-1 border-t border-line pt-2">
              <span className="text-[11.5px] font-medium text-ink-3">Recent runs</span>
              {runs.map((r) => (
                <div key={`${r.at}-${r.status}`} className="flex min-w-0 items-center gap-2 text-[12.5px]" title={r.note}>
                  <span className={`w-14 shrink-0 font-medium ${STATUS[r.status].cls}`}>{STATUS[r.status].label}</span>
                  <span className="shrink-0 text-ink-2 tabular-nums">{when(r.at)}</span>
                  <span className="min-w-0 truncate text-ink-3">{r.agent} · {HOW[r.how]}{r.note ? ` · ${r.note}` : ""}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
