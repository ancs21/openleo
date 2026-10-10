import { useState } from "react";
import { FIELD_TYPES, fieldId, MAX_FIELDS, type Field, type FieldType } from "../../../shared/fields";
import type { TaskCard } from "../../../shared/types";
import { Button } from "../../components/Button";
import { fieldClass } from "../../components/field";
import { Icon, glyphs } from "../../components/Icon";
import { Confirm } from "../../components/Modal";
import { MenuItem, Popover } from "../../components/Popover";
import { Select } from "../../components/Select";
import { useBoard } from "./store";

const input = `${fieldClass} h-8 w-full px-2.5`;
const cell = "h-8 w-full rounded-[6px] bg-transparent px-2 text-[13px] text-ink outline-none placeholder:text-ink-3 hover:bg-hover focus:bg-field focus:ring-2 focus:ring-accent/40";
export const TYPE_LABELS: Record<FieldType, string> = { text: "Text", number: "Number", date: "Date", link: "Link", select: "Choice" };
const PLACEHOLDER: Record<FieldType, string> = { text: "Empty", number: "0", date: "", link: "https://…", select: "" };

export function CardField({ card, field }: { card: TaskCard; field: Field }) {
  const { board, setFields } = useBoard();
  const [menu, setMenu] = useState(false);
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <Popover open={menu} onClose={() => setMenu(false)} align="left" className="w-52" trigger={
        <button type="button" aria-expanded={menu} onClick={() => setMenu((m) => !m)} title={`${TYPE_LABELS[field.type]} field`}
          className="w-fit max-w-full truncate text-left text-[13px] text-ink-2 hover:text-ink">{field.name}</button>
      }>
        <MenuItem danger onClick={() => { setMenu(false); setConfirming(true); }}>Delete field</MenuItem>
      </Popover>
      <Confirm open={confirming} onClose={() => setConfirming(false)} title={`Delete “${field.name}”?`} confirmLabel="Delete field"
        message="It's removed from every card on this board, with its values." onConfirm={() => void setFields((board?.fields ?? []).filter((f) => f.id !== field.id))} />
      <FieldValue card={card} field={field} />
    </div>
  );
}

/** `bare`: as a table cell, without the field box. */
export function FieldValue({ card, field, bare = false }: { card: TaskCard; field: Field; bare?: boolean }) {
  const box = bare ? cell : input;
  const setValue = useBoard((s) => s.setValue);
  const value = card.values?.[field.id] ?? "";
  const commit = (v: string) => { if (v.trim() !== value) void setValue(card.id, field.id, v.trim()); };
  const label = `${field.name} of #${card.num}`;

  if (field.type === "select") {
    return <Select label={label} value={value} onChange={commit} bare={bare}
      options={[{ value: "", label: "—" }, ...(field.options ?? []).map((o) => ({ value: o, label: o }))]} />;
  }
  if (field.type === "date") {
    return <input type="date" aria-label={label} value={value} onChange={(e) => commit(e.target.value)} className={box} />;
  }
  return (
    <div className="flex items-center gap-1">
      {/* Saved when it loses focus; the key resets it when the value changes elsewhere (an agent, another window). */}
      <input key={value} defaultValue={value} aria-label={label} placeholder={PLACEHOLDER[field.type]}
        inputMode={field.type === "number" ? "decimal" : field.type === "link" ? "url" : undefined}
        onBlur={(e) => commit(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") { e.currentTarget.value = value; e.currentTarget.blur(); } }}
        className={box} />
      {field.type === "link" && value && (
        <a href={value} target="_blank" rel="noreferrer" title="Open link" aria-label="Open link"
          className="flex size-8 shrink-0 items-center justify-center rounded-control text-ink-2 hover:bg-hover hover:text-ink">
          <Icon size={13}>{glyphs.external}</Icon>
        </a>
      )}
    </div>
  );
}

export function AddField({ className }: { className: string }) {
  const { board, setFields } = useBoard();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<FieldType>("text");
  const [options, setOptions] = useState("");
  const fields = board?.fields ?? [];
  const taken = fields.some((f) => f.name.toLowerCase() === name.trim().toLowerCase());
  const choices = options.split(",").map((o) => o.trim()).filter(Boolean);
  const ready = name.trim() && !taken && (type !== "select" || choices.length > 0);
  const add = () => {
    if (!ready) return;
    void setFields([...fields, { id: fieldId(name, fields), name: name.trim(), type, ...(type === "select" ? { options: choices } : {}) }]);
    setOpen(false); setName(""); setType("text"); setOptions("");
  };
  if (fields.length >= MAX_FIELDS) return null;
  return (
    <Popover open={open} onClose={() => setOpen(false)} className="w-72 p-3" trigger={
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className={className}>Add field</button>
    }>
      <form className="flex flex-col gap-2.5" onSubmit={(e) => { e.preventDefault(); add(); }}>
        <p className="text-[12.5px] text-ink-3">Every card on this board gets it. Agents fill it in as they work.</p>
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Name, e.g. Priority" aria-label="Field name" maxLength={40} className={input} />
        {taken && <p className="text-[12px] text-red">This board has a field with that name.</p>}
        <Select label="Field type" value={type} onChange={setType} options={FIELD_TYPES.map((t) => ({ value: t, label: TYPE_LABELS[t] }))} />
        {type === "select" && <input value={options} onChange={(e) => setOptions(e.target.value)} placeholder="Choices, comma-separated: High, Medium, Low" aria-label="Choices" className={input} />}
        <div className="flex justify-end gap-2">
          <Button type="button" onClick={() => setOpen(false)}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={!ready}>Add field</Button>
        </div>
      </form>
    </Popover>
  );
}

/** At most `max` filled-in values, like "Priority 3". */
export function FieldChips({ card, max = 3 }: { card: TaskCard; max?: number }) {
  const fields = useBoard((s) => s.board?.fields ?? NONE);
  const filled = fields.filter((f) => card.values?.[f.id]).slice(0, max);
  if (!filled.length) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {filled.map((f) => (
        <span key={f.id} title={`${f.name}: ${card.values![f.id]}`} className="inline-flex h-5 max-w-full items-center gap-1 truncate rounded-[6px] bg-field px-1.5 text-[11.5px] text-ink-2">
          <span className="text-ink-3">{f.name}</span>
          <span className="truncate font-medium">{f.type === "link" ? card.values![f.id]!.replace(/^https?:\/\//, "") : card.values![f.id]}</span>
        </span>
      ))}
    </div>
  );
}
const NONE: Field[] = [];
