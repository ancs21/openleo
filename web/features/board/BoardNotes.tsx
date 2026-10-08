import { useEffect, useState } from "react";
import { MEMORY_KEEPER, type BoardNotes as Notes } from "../../../shared/types";
import { Dialog } from "../../components/Dialog";
import { fieldClass } from "../../components/field";
import { Confirm } from "../../components/Modal";
import { Shimmer, Spinner } from "../../components/motion";
import { Switch } from "../../components/Switch";
import { api, json } from "../../lib/api";
import { empty, LinkButton } from "../../components/form";
import { useBoard } from "./store";

const section = "flex flex-col gap-2";
const heading = "text-[13.5px] font-semibold text-ink";
const hint = "text-[12.5px] text-ink-3";
const area = `${fieldClass} min-h-24 w-full resize-y px-3 py-2 text-[13px] leading-relaxed`;
const NOTE_FIELDS = [
  { key: "agents", title: "About this board", hint: "What this board is for, its rules, where files go. Every agent here reads it.", placeholder: "This board runs my agency's sales. Prices are in USD. Save reports in the Reports folder." },
  { key: "soul", title: "Personality", hint: "How agents on this board sound, and what they never do.", placeholder: "Warm and short. Plain words, no jargon. Never promise a discount." },
  { key: "user", title: "About you", hint: "Your name, your work, how you like answers. Agents may add what they learn.", placeholder: "I'm Sam, I run a small design agency. I like bullet points and a one-line summary first." },
  { key: "memory", title: "Memory", hint: "What agents should keep in mind. They add to it as they work; change or delete anything.", placeholder: "Nothing yet. Agents add what they learn here." },
] as const;

/** A board's notes and memory: plain files in its computer that every agent on the board reads. (Skills belong to each agent.) */
export function BoardNotes({ board, onClose }: { board: string; onClose: () => void }) {
  const [notes, setNotes] = useState<Notes>();
  const [error, setError] = useState<string>();
  const base = `/api/boards/${board}`;
  useEffect(() => { api<Notes>(`${base}/notes`).then(setNotes, (e) => setError((e as Error).message)); }, [base]);
  return (
    <Dialog title="Notes and memory" onClose={onClose} className="w-[min(720px,calc(100vw-32px))]">
      {error ? <p role="alert" className="text-[13px] text-red">{error}</p>
        : !notes ? <div className={`${empty} flex items-center justify-center gap-2`}><Spinner /><Shimmer>Opening this board's computer</Shimmer></div>
        : (
          <div className="flex min-h-0 flex-col gap-6 overflow-y-auto pb-1">
            <p className={hint}>Kept as files in this board's computer, so agents can read and update them while they work. Each agent's skills are set in the agent itself.</p>
            {NOTE_FIELDS.map((f) => (
              <NoteField key={f.key} title={f.title} hint={f.hint} placeholder={f.placeholder} value={notes[f.key]} onSave={async (text) => setNotes(await api<Notes>(`${base}/notes/${f.key}`, json({ text }, "PUT")))} />
            ))}
            <TidySwitch board={board} />
            <RecentNotes days={notes.days} onForget={async (date) => setNotes(await api<Notes>(`${base}/notes/days/${date}`, { method: "DELETE" }))} />
          </div>
        )}
    </Dialog>
  );
}

/** One note file: edit it, and it saves when you leave the box. */
function NoteField({ title, hint: help, placeholder, value, onSave }: { title: string; hint: string; placeholder: string; value: string; onSave: (text: string) => Promise<void> }) {
  const [state, setState] = useState<"idle" | "saving" | "saved" | Error>("idle");
  return (
    <section className={section}>
      <div className="flex items-end justify-between gap-3">
        <div>
          <h3 className={heading}>{title}</h3>
          <p className={hint}>{help}</p>
        </div>
        <span className={`shrink-0 text-[12px] ${state instanceof Error ? "text-red" : "text-ink-3"}`} aria-live="polite">
          {state === "saving" ? "Saving…" : state === "saved" ? "Saved" : state instanceof Error ? "Couldn't save" : ""}
        </span>
      </div>
      <textarea key={value} defaultValue={value} aria-label={title} placeholder={placeholder} className={area}
        onBlur={async (e) => {
          const text = e.target.value;
          if (text.trim() === value.trim()) return;
          setState("saving");
          try { await onSave(text); setState("saved"); } catch (err) { setState(err as Error); }
        }} />
    </section>
  );
}

/** The nightly tidy: a repeating card on this board whose agent folds the daily notes into Memory. */
function TidySwitch({ board }: { board: string }) {
  const card = useBoard((s) => Object.values(s.board?.cards ?? {}).find((c) => c.kind === "task" && c.schedule?.agent === MEMORY_KEEPER));
  const on = card?.kind === "task" && !!card.schedule && !card.schedule.paused;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const toggle = async () => {
    setBusy(true); setError(undefined);
    try {
      await api(`/api/boards/${board}/tidy`, json({ on: !on, zone: Intl.DateTimeFormat().resolvedOptions().timeZone }));
      await useBoard.getState().load();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-3 rounded-card border border-line px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] font-medium">Tidy memory every night</div>
          <p className={hint}>At 3:00 an agent folds the past days' notes into Memory and files them away. It's a repeating card on this board, and uses a little of your ChatGPT plan each night.</p>
        </div>
        <Switch label="Tidy memory every night" checked={on} disabled={busy} onChange={() => void toggle()} />
      </div>
      {error && <p role="alert" className="text-[12.5px] text-red">{error}</p>}
    </div>
  );
}

/** The daily notes agents wrote, newest first, each day with Forget. */
function RecentNotes({ days, onForget }: { days: Notes["days"]; onForget: (date: string) => Promise<void> }) {
  const [forgetting, setForgetting] = useState<string>();
  return (
    <section className={section}>
      <div>
        <h3 className={heading}>Recent notes</h3>
        <p className={hint}>What agents noted while they worked, with who wrote each line. Notes, not orders: your messages always come first.</p>
      </div>
      {days.length ? days.map((d) => (
        <div key={d.date} className="rounded-card border border-line px-3 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[12.5px] font-medium text-ink-2">{new Date(`${d.date}T12:00`).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}</span>
            <LinkButton danger onClick={() => setForgetting(d.date)}>Forget</LinkButton>
          </div>
          <p className="mt-1 whitespace-pre-wrap text-[12.5px] leading-relaxed text-ink">{d.text || "(empty)"}</p>
        </div>
      )) : <p className={hint}>No notes yet.</p>}
      <Confirm open={!!forgetting} onClose={() => setForgetting(undefined)} title="Forget this day's notes?" confirmLabel="Forget"
        message="Agents won't see them again. This can't be undone." onConfirm={() => void onForget(forgetting!)} />
    </section>
  );
}
