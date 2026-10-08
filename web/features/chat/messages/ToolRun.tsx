// ToolChips -> ToolRun/ToolRow, wired to live tool calls.
import { useState } from "react";
import { Icon, glyphs } from "../../../components/Icon";
import { Chevron, Reveal, Shimmer, Spinner } from "../../../components/motion";
import type { ToolPart } from "../useAgent";

/** Map a raw tool call to a ToolChips-style row: icon, verb, chip. */
function describe(p: ToolPart) {
  const a = (p.input ?? {}) as Record<string, string>;
  if (p.toolName === "bash") return { icon: glyphs.run, label: "Run", chip: a.command, mono: true };
  if (p.toolName === "write_file") return { icon: glyphs.write, label: "Write", chip: a.path, mono: true };
  if (p.toolName === "read_file") return { icon: glyphs.file, label: "Read", chip: a.path, mono: true };
  if (p.toolName === "fetch_url") return { icon: glyphs.globe, label: "Fetch", chip: a.url, mono: true };
  if (p.toolName === "web_search") {
    const verb = a.type === "open_page" ? "Open" : a.type === "find" ? "Find" : a.type ? "Search" : "Searching the web";
    return { icon: glyphs.search, label: verb, chip: a.query ?? a.url ?? "", mono: false };
  }
  if (p.toolName === "computer") {
    const c = (p.input ?? {}) as Record<string, any>;
    const at = c.x != null ? `${c.x}, ${c.y}${c.to_x != null ? ` → ${c.to_x}, ${c.to_y}` : ""}` : "";
    const label = String(c.action ?? "").replace("_", " ");
    const chip = c.action === "type" ? c.text : c.action === "key" ? (c.keys ?? []).join(" + ") : c.action === "scroll" ? `dx ${c.dx ?? 0}, dy ${c.dy ?? 0}` : at || "desktop";
    return { icon: glyphs.cursor, label: label.charAt(0).toUpperCase() + label.slice(1), chip, mono: c.action !== "type" };
  }
  if (p.toolName.startsWith("ask_")) return { icon: glyphs.agent, label: `Ask ${p.toolName.slice(4)}`, chip: a.task, mono: false };
  // Leo's board tools, and filling in a card's fields.
  const t = (p.input ?? {}) as { list?: string; cards?: unknown[]; card?: number; agent?: string; rename?: string; fields?: { name: string }[]; values?: Record<string, string> };
  if (p.toolName === "read_board") return { icon: glyphs.board, label: "Read board", chip: "lists, cards and fields", mono: false };
  if (p.toolName === "add_cards") return { icon: glyphs.plus, label: "Add cards", chip: `${t.cards?.length ?? 0} to ${t.list}`, mono: false };
  if (p.toolName === "update_card") return { icon: glyphs.write, label: "Update card", chip: `#${t.card}${t.list ? ` → ${t.list}` : ""}`, mono: false };
  if (p.toolName === "set_list") return { icon: glyphs.board, label: "Set up list", chip: `${t.rename ?? t.list}${t.agent ? ` · new cards go to ${t.agent}` : ""}`, mono: false };
  if (p.toolName === "add_fields") return { icon: glyphs.plus, label: "Add fields", chip: (t.fields ?? []).map((f) => f.name).join(", "), mono: false };
  if (p.toolName === "start_agent") return { icon: glyphs.agent, label: "Start agent", chip: `${t.agent} on #${t.card}`, mono: false };
  if (p.toolName === "set_card_fields") return { icon: glyphs.write, label: "Fill in fields", chip: Object.entries(t.values ?? {}).map(([k, v]) => `${k}: ${v}`).join(" · "), mono: false };
  return { icon: glyphs.run, label: p.toolName, chip: JSON.stringify(p.input), mono: true };
}

export function ToolRow({ part }: { part: ToolPart }) {
  const [open, setOpen] = useState(false);
  const d = describe(part);
  const running = part.state === "input-available";
  const failed = part.state === "output-error";
  const lines = (part.output ?? "").split("\n").filter((l) => l.trim()).slice(0, 12);
  return (
    <div className="animate-fade-up">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} disabled={running}
        className="group/row -mx-[3px] flex h-7 w-[calc(100%+6px)] min-w-0 items-center gap-2 rounded-control px-[3px] text-left transition-colors duration-100 hover:bg-hover-2 disabled:cursor-default">
        <span className={`relative flex size-4 shrink-0 items-center justify-center ${failed ? "text-red" : "text-ink-3"}`}>
          {running ? <Spinner /> : (
            <>
              <span className={`transition-opacity duration-100 group-hover/row:opacity-0 ${open ? "opacity-0" : ""}`}><Icon size={13}>{d.icon}</Icon></span>
              <span className={`absolute transition-opacity duration-150 group-hover/row:opacity-100 ${open ? "opacity-100" : "opacity-0"}`}><Chevron open={open} /></span>
            </>
          )}
        </span>
        <span className="shrink-0 text-[12.5px] font-medium text-ink">{running ? <Shimmer>{d.label}</Shimmer> : d.label}</span>
        <span className={`inline-flex h-5.5 min-w-0 flex-1 cursor-pointer items-center truncate rounded-chip bg-field px-1.5 text-[11.5px] text-ink-2 shadow-hairline transition-colors duration-100 group-hover/row:bg-hover-2 ${d.mono ? "font-mono" : ""}`}>
          {d.chip}
        </span>
      </button>
      <Reveal open={open}>
        <div className="mt-0.5 mb-1 ml-2 flex flex-col gap-0.5 border-l border-line py-0.5 pl-3.5">
          {/* self-start + max-w-full: the column would otherwise stretch it out of shape */}
          {part.image && (
            <img src={part.image} alt="Sandbox screen after this action" className="my-1 h-auto max-h-56 w-auto max-w-full self-start object-contain rounded-chip shadow-hairline" />
          )}
          {part.image ? null : lines.length ? lines.map((line, i) => /^https?:\/\/\S+$/.test(line) ? (
            <a key={i} href={line} target="_blank" rel="noopener noreferrer" className="truncate font-mono text-[11.5px] leading-[1.6] text-ink-2 hover:text-ink hover:underline">{line}</a>
          ) : (
            // One line per row, like the rest of the run; errors wrap so the whole message stays readable.
            <span key={i} className={`text-[11.5px] leading-[1.6] ${d.mono ? "font-mono" : ""} ${failed ? "break-words whitespace-pre-wrap text-red" : "truncate text-ink-2"}`}>{line}</span>
          )) : <span className="text-[11.5px] text-ink-3">No output</span>}
        </div>
      </Reveal>
    </div>
  );
}

/** ToolChips header: "N tool calls" that collapses the run. */
export function ToolRun({ parts }: { parts: ToolPart[] }) {
  const [open, setOpen] = useState(true);
  const running = parts.some((p) => p.state === "input-available");
  return (
    <div className="w-full">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)}
        className="-mx-1.5 flex w-fit items-center gap-1.5 rounded-control px-1.5 py-1 text-[12.5px] text-ink-2 transition-colors duration-100 hover:bg-hover-2">
        <Chevron open={open} />
        <span className="tabular-nums">{parts.length} tool call{parts.length === 1 ? "" : "s"}{running ? "…" : ""}</span>
      </button>
      <Reveal open={open}>
        <div className="-mx-1 px-1.5 pb-1"><div className="mt-1 flex flex-col gap-1">{parts.map((p) => <ToolRow key={p.toolCallId} part={p} />)}</div></div>
      </Reveal>
    </div>
  );
}
