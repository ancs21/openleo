import { useState } from "react";
import type { AgentDef } from "../../../shared/types";
import { Button } from "../../components/Button";
import { Spinner } from "../../components/motion";
import { Segmented } from "../../components/Segmented";
import { api, json } from "../../lib/api";
import { TEMPLATES, titleOf } from "./templates";

/** Fill the new-agent form from a description (the model drafts it) or from a template. */
export function StartingPoint({ model, onApply }: { model: string; onApply: (def: AgentDef) => void }) {
  const [mode, setMode] = useState<"describe" | "template">("describe");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [picked, setPicked] = useState<string>();

  const generate = async () => {
    if (!text.trim() || busy) return;
    setBusy(true); setError(undefined);
    try { onApply(await api<AgentDef>("/api/agents/draft", json({ description: text, model }))); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <div className="flex flex-col gap-3">
      <Segmented className="w-full" value={mode} onChange={setMode}
        options={[{ value: "describe", label: "Describe it" }, { value: "template", label: "Ready-made" }]} />
      {mode === "describe" ? (
        <>
          <textarea aria-label="Describe your agent" rows={3} value={text} disabled={busy}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void generate(); } }}
            placeholder="For example: Every morning, check our website for changes and write me a short summary."
            className="block w-full resize-y rounded-control bg-field px-3 py-2.5 text-[13px] leading-relaxed text-ink shadow-inset-field outline-none placeholder:text-ink-3 focus:ring-2 focus:ring-accent/40" />
          <div className="flex items-center justify-end gap-3">
            {error && <span role="alert" className="mr-auto text-[12.5px] text-red">{error}</span>}
            {busy && <span className="flex items-center gap-1.5 text-[12px] text-ink-3"><Spinner /> Drafting…</span>}
            <Button type="button" disabled={!text.trim() || busy} onClick={() => void generate()}>Draft it for me</Button>
          </div>
        </>
      ) : (
        <div className="grid grid-cols-3 gap-2 max-md:grid-cols-2 max-sm:grid-cols-1">
          {TEMPLATES.map((t) => (
            <button key={t.name} type="button" aria-pressed={picked === t.name}
              onClick={() => { setPicked(t.name); onApply({ ...t, model, subagents: [] }); }}
              className={`flex flex-col gap-1 rounded-card bg-surface p-3 text-left shadow-card transition-[background-color,box-shadow,transform] duration-150 hover:bg-hover active:scale-[0.99] ${picked === t.name ? "ring-2 ring-accent" : ""}`}>
              <span className="text-[13px] font-medium">{titleOf(t.name)}</span>
              <span className="line-clamp-2 text-[12px] leading-snug text-ink-3">{t.description}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
