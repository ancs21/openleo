import { useState } from "react";
import { FIELD_TYPES, type Field } from "../../../shared/fields";
import { Button } from "../../components/Button";
import { Dialog } from "../../components/Dialog";
import { fieldClass } from "../../components/field";
import { Icon, glyphs } from "../../components/Icon";
import { IconButton } from "../../components/IconButton";
import { Confirm } from "../../components/Modal";
import { Shimmer } from "../../components/motion";
import { Select } from "../../components/Select";
import { useApp } from "../../stores/app-store";
import { BoardNotes } from "./BoardNotes";
import { AddField, TYPE_LABELS } from "./CardFields";
import { ListIcon } from "./ListColumn";
import { useBoard } from "./store";

const input = `${fieldClass} h-8 w-full px-2.5`;
const section = "flex flex-col gap-2";
const heading = "text-[13.5px] font-semibold text-ink";
const hint = "text-[12.5px] text-ink-3";
const row = "flex min-h-11 items-center gap-2 rounded-card border border-line px-3 py-2";

/** The whole board in one place: its name, the fields every card has, and what each list does with new cards. */
export function BoardSettings({ onClose }: { onClose: () => void }) {
  const { board, boardId, renameBoard, setFields, setAutomationList } = useBoard();
  const agents = useApp((s) => s.agents);
  const sandboxed = useApp((s) => s.sandbox?.sandboxed);
  const [notes, setNotes] = useState(false);
  if (!board) return null;
  if (notes) return <BoardNotes board={boardId} onClose={() => setNotes(false)} />;
  const fields = board.fields ?? [];
  const change = (id: string, patch: Partial<Field>) => void setFields(fields.map((f) => (f.id === id ? { ...f, ...patch } : f)));

  return (
    <Dialog title="Board settings" onClose={onClose} className="w-[min(640px,calc(100vw-32px))]">
      <div className="flex min-h-0 flex-col gap-6 overflow-y-auto pb-1">
        <SetupChat />

        <section className={section}>
          <h3 className={heading}>Name</h3>
          <input key={board.title} defaultValue={board.title} aria-label="Board name" maxLength={80} className={input}
            onBlur={(e) => { const t = e.target.value.trim(); if (t && t !== board.title) void renameBoard(t); else e.target.value = board.title; }}
            onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} />
        </section>

        <section className={section}>
          <div className="flex items-end justify-between gap-3">
            <div>
              <h3 className={heading}>Fields</h3>
              <p className={hint}>Every card on this board has them. Agents fill them in as they work, and can add new ones.</p>
            </div>
            <AddField className="inline-flex h-8 shrink-0 items-center whitespace-nowrap rounded-control bg-surface px-3 text-[13px] font-medium text-ink shadow-btn hover:bg-hover" />
          </div>
          {fields.map((f) => <FieldRow key={f.id} field={f} onChange={(patch) => change(f.id, patch)}
            onDelete={() => void setFields(fields.filter((x) => x.id !== f.id))} taken={(name) => fields.some((x) => x.id !== f.id && x.name.toLowerCase() === name.toLowerCase())} />)}
          {!fields.length && <p className={hint}>No fields yet. Add one like Priority, Due date or Website.</p>}
        </section>

        {sandboxed && (
          <section className={section}>
            <div>
              <h3 className={heading}>Notes and memory</h3>
              <p className={hint}>What agents on this board know: about the board and you, their personality, and their memory.</p>
            </div>
            <button type="button" onClick={() => setNotes(true)} className={`${row} text-left hover:bg-hover`}>
              <Icon className="shrink-0 text-ink-2">{glyphs.file}</Icon>
              <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-ink">Open notes and memory</span>
              <Icon size={12} className="shrink-0 -rotate-90 text-ink-3">{glyphs.chevron}</Icon>
            </button>
          </section>
        )}

        <section className={section}>
          <div>
            <h3 className={heading}>Lists</h3>
            <p className={hint}>What happens when a card is added to each list, and which of its cards repeat.</p>
          </div>
          {board.lists.map((l) => {
            const agent = agents.find((a) => a.name === l.agent);
            const repeating = l.cards.filter((id) => board.cards[id]?.schedule && !board.cards[id]!.schedule!.paused).length;
            return (
              <button key={l.id} type="button" onClick={() => { onClose(); setAutomationList(l.id); }} className={`${row} text-left hover:bg-hover`}>
                <ListIcon icon={l.icon} />
                <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-ink">{l.title}</span>
                <span className="truncate text-[12.5px] text-ink-3">
                  {agent ? `New cards go to ${agent.name}` : "Nothing happens"}{repeating ? ` · ${repeating} repeating` : ""}
                </span>
                <Icon size={12} className="shrink-0 -rotate-90 text-ink-3">{glyphs.chevron}</Icon>
              </button>
            );
          })}
        </section>
      </div>
    </Dialog>
  );
}

/** Say what the board is for; the lists and fields it needs are added (and can be changed below). */
function SetupChat() {
  const setupBoard = useBoard((s) => s.setupBoard);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string }>();
  const send = async () => {
    if (!text.trim() || busy) return;
    setBusy(true); setNote(undefined);
    try {
      const { lists, fields } = await setupBoard(text);
      const parts = [lists.length && `${lists.length} list${lists.length > 1 ? "s" : ""} (${lists.join(", ")})`, fields.length && `${fields.length} field${fields.length > 1 ? "s" : ""} (${fields.join(", ")})`].filter(Boolean);
      setNote({ ok: true, text: parts.length ? `Added ${parts.join(" and ")}.` : "The board already has what that needs." });
      setText("");
    } catch (e) { setNote({ ok: false, text: (e as Error).message }); }
    finally { setBusy(false); }
  };
  return (
    <section className={section}>
      <div>
        <h3 className={heading}>Set up by chatting</h3>
        <p className={hint}>Say what this board is for. The lists and fields it needs are added for you.</p>
      </div>
      <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); void send(); }}>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} disabled={busy} aria-label="What is this board for?"
          placeholder="A sales pipeline for my agency: track each deal's value, website and next follow-up"
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
          className={`${fieldClass} min-h-16 flex-1 resize-none px-3 py-2 leading-relaxed disabled:opacity-60`} />
        <Button type="submit" variant="primary" disabled={!text.trim() || busy} className="shrink-0">{busy ? <Shimmer>Setting up</Shimmer> : "Set up"}</Button>
      </form>
      {note && <p className={`text-[12.5px] ${note.ok ? "text-ink-2" : "text-red"}`}>{note.text}</p>}
    </section>
  );
}

/** One field: rename it, change its type (values that don't fit the new type are dropped), edit a choice's options, delete it. */
function FieldRow({ field, onChange, onDelete, taken }: {
  field: Field; onChange: (patch: Partial<Field>) => void; onDelete: () => void; taken: (name: string) => boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="flex flex-col gap-2 rounded-card border border-line p-2.5">
      <div className="flex items-center gap-2">
        <input key={field.name} defaultValue={field.name} aria-label="Field name" maxLength={40} className={input}
          onBlur={(e) => { const n = e.target.value.trim(); if (n && n !== field.name && !taken(n)) onChange({ name: n }); else e.target.value = field.name; }}
          onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} />
        <Select label={`Type of ${field.name}`} className="w-32 shrink-0" value={field.type}
          onChange={(type) => onChange({ type, options: type === "select" ? field.options ?? [] : undefined })}
          options={FIELD_TYPES.map((t) => ({ value: t, label: TYPE_LABELS[t] }))} />
        <IconButton size="sm" aria-label={`Delete ${field.name}`} title="Delete field" onClick={() => setConfirming(true)}><Icon>{glyphs.close}</Icon></IconButton>
      </div>
      {field.type === "select" && (
        <input key={field.options?.join(",")} defaultValue={field.options?.join(", ")} aria-label={`Choices of ${field.name}`} placeholder="Choices, comma-separated: High, Medium, Low" className={input}
          onBlur={(e) => { const options = e.target.value.split(",").map((o) => o.trim()).filter(Boolean); if (options.join(",") !== field.options?.join(",")) onChange({ options }); }}
          onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} />
      )}
      <Confirm open={confirming} onClose={() => setConfirming(false)} title={`Delete “${field.name}”?`} confirmLabel="Delete field"
        message="It's removed from every card on this board, with its values." onConfirm={onDelete} />
    </div>
  );
}
