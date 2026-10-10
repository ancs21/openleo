import { useEffect, useState } from "react";
import type { AgentSkill, Skill, SkillPreview, SkillResult } from "../../../shared/types";
import { Button } from "../../components/Button";
import { Dialog } from "../../components/Dialog";
import { fieldClass } from "../../components/field";
import { Markdown } from "../../components/Markdown";
import { Spinner } from "../../components/motion";
import { api } from "../../lib/api";
import { card, grid, NewButton, SearchBox } from "./Extensions";
import { empty } from "../../components/form";
import { Group, Info, Label, LinkButton, Section } from "../../components/form";
import { titleOf } from "./templates";

// The agent's definition keeps its skill list; the files go into the computer of the board it works on.

const section = "flex flex-col gap-2";
const heading = "text-[13.5px] font-semibold text-ink";
const area = `${fieldClass} min-h-24 w-full resize-y px-3 py-2 text-[13px] leading-relaxed`;
const SUGGESTIONS = ["Writing", "Email", "Meeting notes", "Research", "Reports", "PDF", "Spreadsheets", "Sales"];
const installs = (n: number) => `${n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}K` : n} installs`;
/** "Brand voice" becomes brand-voice, the skill's name in the computer. */
const skillName = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64);

type View = { kind: "find" } | { kind: "preview"; id: string } | { kind: "write"; skill?: AgentSkill };
const TITLES = { find: "Add a skill", preview: "Check this skill", write: "Write a skill" };

export function SkillsSection({ skills, onChange }: { skills: AgentSkill[]; onChange: (skills: AgentSkill[]) => void }) {
  const [view, setView] = useState<View>();
  const put = (s: AgentSkill) => { onChange([...skills.filter((x) => x.name !== s.name), s]); setView(undefined); };
  const title = view?.kind === "write" && view.skill ? `Edit “${titleOf(view.skill.name)}”` : view && TITLES[view.kind];
  return (
    <Section title="Skills"
      info="How-tos only this agent uses, like your writing style or how to fill in a PDF form. It loads one when a task needs it."
      action={<LinkButton onClick={() => setView({ kind: "find" })}>Add a skill</LinkButton>}>
      {skills.length ? (
        <Group>
          {skills.map((s) => (
            <div key={s.name} className="flex min-h-9 items-center gap-2">
              <span className="min-w-0 truncate text-[13.5px]">{titleOf(s.name)}</span>
              {s.description && <Info text={s.description} />}
              {!!s.programs && <ProgramsTag />}
              <span className="flex-1" />
              {s.instructions !== undefined && <LinkButton onClick={() => setView({ kind: "write", skill: s })}>Edit</LinkButton>}
              <LinkButton onClick={() => onChange(skills.filter((x) => x.name !== s.name))}>Remove</LinkButton>
            </div>
          ))}
        </Group>
      ) : <p className="text-[13px] text-ink-3">No skills yet.</p>}
      {view && title && (
        <Dialog title={title} onClose={() => setView(undefined)} className="w-[min(720px,calc(100vw-32px))]">
          {view.kind !== "find" && <div className="-mt-1 -ml-1.5"><LinkButton onClick={() => setView({ kind: "find" })}>← Back</LinkButton></div>}
          {view.kind === "find" && <FindSkills onPick={(id) => setView({ kind: "preview", id })} onWrite={() => setView({ kind: "write" })} added={skills.map((s) => s.name)} />}
          {view.kind === "preview" && <Preview id={view.id} onAdd={(p) => put({ name: p.name, description: p.description, source: p.id, hash: p.hash, ...(p.programs ? { programs: p.programs } : {}) })} />}
          {view.kind === "write" && <SkillForm skill={view.skill} taken={skills.map((s) => s.name)} onCancel={() => setView(undefined)} onSave={put} />}
        </Dialog>
      )}
    </Section>
  );
}

const ProgramsTag = () => <span title="Brings programs that run in this board's computer" className="shrink-0 rounded-chip bg-inset px-1.5 py-0.5 text-[11.5px] font-medium text-ink-2 shadow-hairline">Runs programs</span>;

function FindSkills({ onPick, onWrite, added }: { onPick: (id: string) => void; onWrite: () => void; added: string[] }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SkillResult[] | "failed">();
  useEffect(() => {
    if (!q.trim()) { setResults(undefined); return; }
    const t = setTimeout(() => api<SkillResult[]>(`/api/skills/search?${new URLSearchParams({ q })}`).then(setResults, () => setResults("failed")), 300);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <>
      <SearchBox value={q} onChange={setQ} placeholder="Search skills, like meeting notes or PDF" />
      <div className="flex shrink-0 flex-wrap gap-1">
        {SUGGESTIONS.map((s) => (
          <button key={s} type="button" onClick={() => setQ(s)} className="h-7 rounded-full px-2.5 text-[12.5px] font-medium text-ink-2 hover:bg-hover">{s}</button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {!q.trim() ? <p className={empty}>Search the open skills directory at skills.sh, or write your own.</p>
          : results === undefined ? <div className={`${empty} flex items-center justify-center gap-2`}><Spinner /> Searching…</div>
          : results === "failed" ? <p className={empty}>Can't reach skills.sh right now. You can still write your own.</p>
          : !results.length ? <p className={empty}>No skills match. Try other words.</p>
          : (
            <ul className={grid}>
              {results.map((r) => (
                <li key={r.id} className={card}>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13.5px] font-medium">{titleOf(r.name)}</div>
                    <div className="mt-0.5 truncate text-[12px] text-ink-3">{r.source} · {installs(r.installs)}</div>
                  </div>
                  {added.includes(r.name) ? <span className="flex h-7 shrink-0 items-center px-1.5 text-[12.5px] font-medium text-green">Added</span>
                    : <Button type="button" className="h-7 shrink-0 px-2 text-[12.5px]" aria-label={`View ${r.name}`} onClick={() => onPick(r.id)}>View</Button>}
                </li>
              ))}
            </ul>
          )}
      </div>
      <div className="flex shrink-0 justify-center border-t border-line pt-3"><NewButton onClick={onWrite}>Write your own</NewButton></div>
    </>
  );
}

/** What a directory skill contains, before it's added: its instructions, its files, and whether it runs programs. */
function Preview({ id, onAdd }: { id: string; onAdd: (skill: SkillPreview) => void }) {
  const [skill, setSkill] = useState<SkillPreview | "failed">();
  const [error, setError] = useState<string>();
  useEffect(() => { api<SkillPreview>(`/api/skills/preview?${new URLSearchParams({ id })}`).then(setSkill, (e) => { setSkill("failed"); setError((e as Error).message); }); }, [id]);
  if (!skill) return <div className={`${empty} flex items-center justify-center gap-2`}><Spinner /> Loading the skill…</div>;
  if (skill === "failed") return <p role="alert" className={empty}>{error}</p>;
  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
        <div>
          <div className="text-[15px] font-semibold">{titleOf(skill.name)}</div>
          <div className="mt-0.5 text-[12.5px] text-ink-3">From <a href={`https://skills.sh/${id}`} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">skills.sh/{id}</a>, written by its author, not by OpenLeo</div>
          {skill.description && <p className="mt-2 text-[13px] text-ink-2">{skill.description}</p>}
        </div>
        {skill.programs > 0 && (
          <p className="rounded-card bg-inset px-3 py-2.5 text-[12.5px] leading-relaxed text-ink-2 shadow-hairline">
            <span className="font-medium text-ink">Runs programs.</span> This skill brings {skill.programs} {skill.programs === 1 ? "program" : "programs"}. They run in the computer of the board the agent works on, never on your Mac. Only add skills from authors you trust.
          </p>
        )}
        <section className={section}>
          <h3 className={heading}>What it tells agents</h3>
          <div className="max-h-72 overflow-y-auto rounded-card border border-line px-3.5 py-3"><Markdown text={skill.instructions} tone="text-[13px] leading-[1.6] text-ink" /></div>
        </section>
        <section className={section}>
          <h3 className={heading}>Files ({skill.files.length})</h3>
          <ul className="flex flex-col gap-0.5 font-mono text-[12px] text-ink-2">{skill.files.map((f) => <li key={f.path}>{f.path}</li>)}</ul>
        </section>
      </div>
      <div className="flex shrink-0 justify-end gap-2 border-t border-line pt-3">
        <Button type="button" variant="primary" onClick={() => onAdd(skill)}>Add to this agent</Button>
      </div>
    </>
  );
}

function SkillForm({ skill, taken, onSave, onCancel }: { skill?: AgentSkill; taken: string[]; onSave: (s: Skill) => void; onCancel: () => void }) {
  const [title, setTitle] = useState(skill ? titleOf(skill.name) : "");
  const [description, setDescription] = useState(skill?.description ?? "");
  const [instructions, setInstructions] = useState(skill?.instructions ?? "");
  const name = skill?.name ?? skillName(title);
  const clash = !skill && taken.includes(name);
  return (
    <div className="flex min-h-0 flex-col gap-3 overflow-y-auto">
      <Label text="Name" hint={skill ? undefined : name ? `saved as ${name}` : undefined}>
        <input className={`${fieldClass} h-8 w-full px-2.5`} placeholder="Brand voice" disabled={!!skill} value={title} onChange={(e) => setTitle(e.target.value)} />
      </Label>
      {clash && <p className="text-[12.5px] text-red">This board already has a skill with that name.</p>}
      <Label text="When to use it">
        <input className={`${fieldClass} h-8 w-full px-2.5`} placeholder="Whenever writing anything customers will read" value={description} onChange={(e) => setDescription(e.target.value)} />
      </Label>
      <Label text="How to do it">
        <textarea className={`${area} min-h-40`} value={instructions} onChange={(e) => setInstructions(e.target.value)}
          placeholder={"Write the steps or rules, like you'd explain them to a new teammate.\nFor example: Friendly, short sentences, no jargon. Sign off with 'The team'."} />
      </Label>
      <div className="flex items-center justify-end gap-2">
        <Button type="button" onClick={onCancel}>Cancel</Button>
        <Button type="button" variant="primary" disabled={!name || clash || !instructions.trim()} onClick={() => onSave({ name, description, instructions })}>Save skill</Button>
      </div>
    </div>
  );
}
