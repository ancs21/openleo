import { useEffect, useState } from "react";
import { agentLabel, EFFORT_LABEL, EFFORTS, type AgentDef, type Effort } from "../../../shared/types";
import { Button } from "../../components/Button";
import { Select } from "../../components/Select";
import { agentId, modelLabel, providerOf } from "../../lib/format";
import { useApp } from "../../stores/app-store";
import { AppsSection } from "./Extensions";
import { SkillsSection } from "./Skills";
import { Group, Info, Row, Section } from "../../components/form";
import { AgentIconPicker } from "../../components/AgentIcon";
import { StartingPoint } from "./StartingPoint";

const EFFORT_HINTS: Partial<Record<Effort, string>> = { off: "no thinking", medium: "default" };


export function AgentBuilder({ form, setForm, isNew, onSave, onDelete, onCancel, notice }: {
  form: AgentDef; setForm: (f: AgentDef) => void; isNew: boolean; onSave: () => void; onDelete: () => void; onCancel: () => void; notice?: string;
}) {
  const models = useApp((s) => s.models);
  const agents = useApp((s) => s.agents);
  const [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => { setConfirmDelete(false); }, [form.name, isNew]);
  const set = (patch: Partial<AgentDef>) => setForm({ ...form, ...patch });
  const toggle = (key: "subagents" | "mcp", v: string, on?: boolean) => {
    const list = form[key] ?? [];
    const next = on ?? !list.includes(v);
    set({ [key]: next ? [...new Set([...list, v])] : list.filter((x) => x !== v) });
  };
  const others = agents.filter((a) => a.name !== form.name);

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <form className="min-h-0 flex-1 overflow-y-auto" onSubmit={(e) => { e.preventDefault(); onSave(); }}>
        <div className="mx-auto flex max-w-2xl flex-col px-6 pb-10">
          <div className="sticky top-0 z-10 -mx-6 flex items-start gap-3 bg-surface px-6 pt-4 pb-3">
            <AgentIconPicker icon={form.icon} onChange={(icon) => set({ icon })} />
            <div className="min-w-0 flex-1">
              <input aria-label="Agent name" required placeholder="Name your agent"
                value={form.title ?? form.name} onChange={(e) => set({ title: e.target.value, ...(isNew ? { name: agentId(e.target.value) } : {}) })}
                className="w-full bg-transparent text-[19px] leading-snug font-semibold tracking-tight text-ink outline-none placeholder:text-ink-3" />
              {form.name && <span title="Its ID, used in links and mentions" className="block font-mono text-[11.5px] text-ink-3">@{form.name}</span>}
              <input aria-label="Short description" placeholder="What it does, in one line"
                value={form.description} onChange={(e) => set({ description: e.target.value })}
                className="w-full bg-transparent text-[13px] text-ink-2 outline-none placeholder:text-ink-3" />
            </div>
            <div className="flex shrink-0 items-center gap-2 pt-1">
              {notice && <span role="status" className="text-[12.5px] text-ink-2 animate-fade-in">{notice}</span>}
              {isNew ? <Button type="button" onClick={onCancel}>Cancel</Button> : confirmDelete
                ? <><Button variant="danger" type="button" onClick={onDelete}>Delete</Button><Button type="button" onClick={() => setConfirmDelete(false)}>Keep</Button></>
                : <Button type="button" onClick={() => setConfirmDelete(true)}>Delete</Button>}
              <Button variant="primary" type="submit">{isNew ? "Create agent" : "Save"}</Button>
            </div>
          </div>

          {isNew && (
            <Section title="Start from" info="Say what you need and we'll draft the agent for you, or pick a ready-made one. You can change everything afterwards.">
              <StartingPoint model={form.model} onApply={setForm} />
            </Section>
          )}

          <Section title="Instructions" info="Tell the agent its job like you'd brief a new teammate: what to do, in what order, and what a good result looks like.">
            <textarea aria-label="Instructions" value={form.instructions} onChange={(e) => set({ instructions: e.target.value })}
              placeholder={"Describe the job step by step. For example:\nRead the request on the card, look up the company's website, and write a short, friendly reply I can send."}
              className="block min-h-44 w-full resize-y bg-transparent text-[13.5px] leading-relaxed text-ink outline-none placeholder:text-ink-3" />
          </Section>

          <SkillsSection skills={form.skills ?? []} onChange={(skills) => set({ skills })} />
          <AppsSection selected={form.mcp ?? []} onToggle={(n, on) => toggle("mcp", n, on)} />

          <Section title="Ask other agents for help" info="Let this agent hand parts of the job to your other agents. Each one works on its own and reports back." defaultOpen={form.subagents.length > 0}>
            {others.length ? (
              <Group title="Can ask">
                {others.map((a) => <Row key={a.name} label={agentLabel(a)} info={a.description || undefined} checked={form.subagents.includes(a.name)} onChange={() => toggle("subagents", a.name)} />)}
              </Group>
            ) : <p className="text-[13px] text-ink-3">Create more agents and they'll show up here.</p>}
          </Section>

          <Section title="Advanced" defaultOpen={false}>
            <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <span className="flex items-center gap-2 text-[12.5px] font-medium text-ink-2">Long conversations <Info text="When a chat gets very long, older messages can be summarized so the agent keeps working smoothly. You can also type /compact in the chat." /></span>
              <Select label="Long conversations" value={form.compact === false ? "keep" : "summarize"} onChange={(v) => set({ compact: v === "keep" ? false : undefined })}
                options={[{ value: "summarize", label: "Summarize older messages when it gets long" }, { value: "keep", label: "Keep every message" }]} />
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="flex items-center gap-2 text-[12.5px] font-medium text-ink-2">How hard it thinks <Info text="More thinking gives better answers on hard jobs, but is slower and uses more of your plan." /></span>
              <Select label="How hard it thinks" value={form.effort ?? "medium"} onChange={(effort) => set({ effort })}
                options={EFFORTS.map((value) => ({ value, label: EFFORT_LABEL[value], extra: EFFORT_HINTS[value] }))} />
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="flex items-center gap-2 text-[12.5px] font-medium text-ink-2">AI model <Info text="Which AI model powers this agent. The default works well for most jobs." /></span>
              <Select label="AI model" value={form.model} onChange={(model) => set({ model })}
                options={[...new Set([form.model, ...models])].filter(Boolean).map((m) => ({ value: m, label: modelLabel(m), extra: providerOf(m) }))} />
            </div>
            </div>
          </Section>
        </div>
      </form>
    </section>
  );
}
