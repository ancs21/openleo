// @ attaches images or mentions a subagent, / runs commands and templates, mic uses browser speech recognition.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { accentChain, ACCENTS, createShader, playSweep } from "glimm";
import { modelLabel, providerOf } from "../../lib/format";
import { EFFORT_LABEL, type Effort } from "../../../shared/types";
import { useClickOutside } from "../../lib/hooks";

const RAINBOW = accentChain([ACCENTS.red, ACCENTS.orange, ACCENTS.yellow, ACCENTS.green, ACCENTS.cyan, ACCENTS.blue, ACCENTS.purple]);
const MAX_IMAGES = 8; // server cap
const MAX_IMAGE_PX = 1600; // downscale big photos so they fit the request cap

function Icon({ children, size = 15, strokeWidth = 1.8 }: { children: ReactNode; size?: number; strokeWidth?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>;
}
const GLYPHS: Record<string, ReactNode> = {
  clip: <path d="m21.4 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />,
  agent: <g><rect x="5" y="8" width="14" height="11" rx="3" /><path d="M12 4v4M9 13h.01M15 13h.01" /></g>,
};

export type Subagent = { name: string; description: string };
export type Command = { key: string; name: string; desc: string; run?: () => void; insert?: string };
type Row = { key: string; name: string; desc: string; glyph?: string; attach?: boolean; command?: Command };
type Attachment = { name: string; url: string };

/** the last @word or /word being typed, if any */
function parseToken(draft: string): { kind: "at" | "slash"; query: string; start: number } | null {
  const m = /(^|\s)([@/])([\w-]*)$/.exec(draft);
  if (!m) return null;
  return { kind: m[2] === "@" ? "at" : "slash", query: m[3]!.toLowerCase(), start: m.index + m[1]!.length };
}

async function readImage(file: File): Promise<string> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, MAX_IMAGE_PX / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.85);
}

const Speech: any = typeof window !== "undefined" ? (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition : undefined;

export default function PromptBar({ placeholder, busy, onSend, onStop, subagents, commands, models, model, onModel, effort, onEffort, isFlagship, footer }: {
  placeholder?: string;
  busy: boolean;
  onSend: (text: string, images: string[]) => void;
  onStop: () => void;
  subagents: Subagent[];
  commands: Command[];
  models: string[];
  model: string;
  onModel: (m: string) => void;
  /** thinking time: with `onEffort`, the model button opens a slider first (the model list is one click further) */
  effort?: Effort;
  onEffort?: (e: Effort) => void;
  /** picking a model that passes this plays the rainbow sweep */
  isFlagship?: (m: string) => boolean;
  footer?: ReactNode;
}) {
  const [draft, setDraft] = useState("");
  const [dismissed, setDismissed] = useState(false);
  const [plusOpen, setPlusOpen] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const [picker, setPicker] = useState<"effort" | "models">("models");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [active, setActive] = useState(0);
  const [listening, setListening] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [rowBox, setRowBox] = useState<{ top: number; height: number } | null>(null);
  const [engaged, setEngaged] = useState(false);
  const [modelBox, setModelBox] = useState<{ top: number; height: number } | null>(null);
  const [modelHovered, setModelHovered] = useState<number | null>(null);
  const [modelMenuLeft, setModelMenuLeft] = useState(0);
  const [modelMenuBottom, setModelMenuBottom] = useState(0);
  const anchorRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const modelRef = useRef<HTMLButtonElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const rowRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const modelRowRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const modelListRef = useRef<HTMLDivElement>(null);
  const glimmRef = useRef<HTMLCanvasElement>(null);
  const shaderRef = useRef<ReturnType<typeof createShader> | null>(null);
  const sweepingRef = useRef(false);
  const recRef = useRef<any>(null);

  const token = dismissed ? null : parseToken(draft);
  const menu: "at" | "slash" | null = plusOpen ? "at" : token?.kind ?? null;
  const query = plusOpen ? "" : token?.query ?? "";

  const sources: Row[] = [
    { key: "attach", name: "Add photos", desc: "Images from your computer", glyph: "clip", attach: true },
    ...subagents.map((s) => ({ key: `sub-${s.name}`, name: s.name, desc: s.description || "Subagent", glyph: "agent" })),
  ];
  const rows: Row[] = menu === "at"
    ? sources.filter((s) => s.name.toLowerCase().includes(query))
    : menu === "slash"
      ? commands.filter((c) => c.name.slice(1).startsWith(query)).map((c) => ({ key: c.key, name: c.name, desc: c.desc, command: c }))
      : [];

  useEffect(() => { setActive(0); setEngaged(false); }, [menu, query]);

  useLayoutEffect(() => {
    const t = rowRefs.current[active];
    if (t) setRowBox({ top: t.offsetTop, height: t.offsetHeight });
  }, [menu, query, active, rows.length]);

  const modelIndex = models.indexOf(model);
  useLayoutEffect(() => {
    if (!modelOpen) return;
    const t = modelRowRefs.current[modelHovered ?? modelIndex];
    if (t) setModelBox({ top: t.offsetTop, height: t.offsetHeight });
  }, [modelOpen, modelHovered, modelIndex]);

  useLayoutEffect(() => {
    if (!modelOpen || !anchorRef.current || !modelRef.current) return;
    const a = anchorRef.current.getBoundingClientRect(), t = modelRef.current.getBoundingClientRect();
    setModelMenuLeft(Math.max(0, Math.min(t.left - a.left, a.width - (modelListRef.current?.offsetWidth ?? 256))));
    setModelMenuBottom(a.bottom - t.top + 8);
    modelRowRefs.current[modelIndex]?.scrollIntoView({ block: "nearest" });
  }, [modelOpen, expanded, model, picker]);

  useEffect(() => { if (!modelOpen) setModelHovered(null); }, [modelOpen]);

  // Pin Math.random while building so the hue phase is the same every time.
  const makeShader = () => {
    const canvas = glimmRef.current;
    if (!canvas) return null;
    const random = Math.random;
    Math.random = () => 0;
    try { return createShader({ canvas, palette: RAINBOW, direction: "ltr", bandTight: 10, swellAmount: 0.85 }); }
    catch { return null; } // no WebGL: skip the flourish
    finally { Math.random = random; }
  };
  useEffect(() => {
    shaderRef.current = makeShader();
    return () => { shaderRef.current?.destroy(); shaderRef.current = null; };
  }, []);
  const celebrate = () => {
    if (sweepingRef.current || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    shaderRef.current?.destroy();
    const shader = makeShader();
    shaderRef.current = shader;
    if (!shader) return;
    sweepingRef.current = true;
    playSweep(shader, { palette: RAINBOW, direction: "ltr", sweepMs: 570, outroMs: 80, peakAlpha: 1.3, bandTight: 10, brightness: 1.4, swellAmount: 1, waveSpeed: 1.8, easing: "easeOutExpo" })
      .done.finally(() => { sweepingRef.current = false; });
  };
  const selectModel = (m: string) => {
    setModelOpen(false);
    if (m === model) return;
    onModel(m);
    if (isFlagship?.(m)) celebrate();
  };

  // Dictation: real browser speech recognition, appended to the draft as it finalizes.
  useEffect(() => {
    if (!listening || !Speech) return;
    const rec = new Speech();
    rec.continuous = true;
    rec.interimResults = false;
    rec.lang = navigator.language;
    rec.onresult = (e: any) => {
      const text = Array.from(e.results as ArrayLike<any>).slice(e.resultIndex).map((r: any) => r[0].transcript).join(" ").trim();
      if (text) setDraft((d) => (d ? `${d.trimEnd()} ${text}` : text));
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    rec.start();
    recRef.current = rec;
    return () => { try { rec.stop(); } catch {} };
  }, [listening]);

  // wrapped text moves above the controls, then grows to a compact max
  useLayoutEffect(() => {
    const input = inputRef.current, controls = controlsRef.current, measure = measureRef.current, mb = modelRef.current;
    if (!input || !controls || !measure || !mb) return;
    const inlineWidth = controls.clientWidth - (28 * 3 + mb.offsetWidth) - 16;
    const needsFull = draft.includes("\n") || measure.offsetWidth + 8 > inlineWidth;
    if (needsFull !== expanded) setExpanded(needsFull);
    input.style.height = "0px";
    const h = input.scrollHeight;
    input.style.height = `${Math.min(Math.max(h, 28), 120)}px`;
    input.style.overflowY = h > 120 ? "auto" : "hidden";
  }, [draft, expanded]);

  const rootRef = useRef<HTMLDivElement>(null);
  useClickOutside(rootRef, () => { setModelOpen(false); setPlusOpen(false); }, modelOpen || plusOpen);

  const closeMenus = () => { setPlusOpen(false); setModelOpen(false); };
  const before = () => (token ? draft.slice(0, token.start) : draft);

  const addFiles = async (files: FileList | null) => {
    const imgs = [...(files ?? [])].filter((f) => f.type.startsWith("image/")).slice(0, MAX_IMAGES - attachments.length);
    const read = await Promise.all(imgs.map(async (f) => ({ name: f.name, url: await readImage(f) })));
    setAttachments((a) => [...a, ...read]);
    inputRef.current?.focus();
  };

  const pick = (row: Row) => {
    if (row.attach) {
      setDraft(before());
      fileRef.current?.click();
    } else if (row.command?.run) {
      setDraft(before());
      row.command.run();
    } else if (row.command?.insert) {
      setDraft(`${before()}${row.command.insert}`);
    } else if (menu === "at") {
      setDraft(`${before()}@${row.name} `);
    } else {
      setDraft(`${before()}${row.name} `);
    }
    setPlusOpen(false);
    setDismissed(false);
    inputRef.current?.focus();
  };

  const canSend = !busy && (draft.trim().length > 0 || attachments.length > 0);
  const send = () => {
    if (!canSend) return;
    onSend(draft.trim() || "See the attached image(s).", attachments.map((a) => a.url));
    setDraft("");
    setAttachments([]);
    closeMenus();
  };

  const wide = expanded;
  const iconBtn = "flex size-7 shrink-0 items-center justify-center rounded-[8px] transition-[background-color,color,transform] duration-150 active:scale-[0.94]";

  return (
    <div ref={rootRef} className="w-full">
      <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
      <div ref={anchorRef} className="relative">
        {menu && (
          <div onMouseLeave={() => setEngaged(false)} className="absolute inset-x-0 bottom-full z-10 mb-2 animate-pop-in rounded-[10px] bg-surface p-1 shadow-raised"
            style={{ transformOrigin: "bottom center" }}>
            <span aria-hidden className="pointer-events-none absolute inset-x-1 rounded-[6px] bg-hover"
              style={{ top: rowBox?.top ?? 0, height: rowBox?.height ?? 0, opacity: rowBox && engaged && rows.length > 0 ? 1 : 0,
                transition: "top 220ms cubic-bezier(0.23,1,0.32,1), height 220ms cubic-bezier(0.23,1,0.32,1), opacity 150ms ease" }} />
            {rows.map((row, i) => (
              <button key={row.key} type="button" ref={(el) => { rowRefs.current[i] = el; }}
                onMouseDown={(e) => e.preventDefault()} onMouseEnter={() => { setActive(i); setEngaged(true); }} onClick={() => pick(row)}
                className="relative z-10 flex h-9 w-full items-center gap-2.5 rounded-[6px] px-2 text-left">
                {row.glyph && <span className="flex size-5.5 shrink-0 items-center justify-center text-ink-2"><Icon>{GLYPHS[row.glyph]}</Icon></span>}
                <span className="shrink-0 text-[12.5px] font-medium text-ink">{row.name}</span>
                <span className="min-w-0 flex-1 truncate text-[12px] text-ink-3">{row.desc}</span>
                {row.command?.run && <span className="shrink-0 text-[11px] text-ink-3">action</span>}
              </button>
            ))}
            {rows.length === 0 && <div className="flex h-9 items-center px-2 text-[12px] text-ink-3">No matches for “{query}”</div>}
            <div className="mt-1 border-t border-line px-2 pt-1.5 pb-1 text-[11px] text-ink-3">
              {menu === "at" ? (subagents.length ? "Attach images or mention a subagent to delegate to" : "Attach images · add subagents in the builder to mention them") : "Commands and prompt templates"}
            </div>
          </div>
        )}

        {modelOpen && (
          <div ref={modelListRef} onMouseLeave={() => setModelHovered(null)}
            className={`absolute z-10 max-h-80 w-64 animate-pop-in overflow-y-auto rounded-card bg-surface shadow-raised ${picker === "effort" ? "p-3" : "p-1"}`}
            style={{ left: modelMenuLeft, bottom: modelMenuBottom, transformOrigin: "bottom left" }}>
            {picker === "effort" && onEffort ? (
              <div className="flex flex-col gap-2.5">
                <button type="button" onClick={() => setPicker("models")} aria-label="Choose another model"
                  className="mx-auto flex h-7 items-center gap-1 rounded-control px-2 text-[13px] font-medium text-ink hover:bg-hover">
                  {modelLabel(model)} <span className="text-ink-3">{EFFORT_LABEL[effort ?? "medium"]}</span>
                  <span className="text-ink-3"><Icon size={11} strokeWidth={2.4}><path d="M9 6l6 6-6 6" /></Icon></span>
                </button>
                <EffortSlider value={effort ?? "medium"} onChange={onEffort} />
              </div>
            ) : <>
            <div className="px-2 pt-1 pb-1.5 text-[12px] text-ink-3">Select model</div>
            <div className="relative">
              <span aria-hidden className="pointer-events-none absolute inset-x-0 rounded-[6px] bg-hover"
                style={{ top: modelBox?.top ?? 0, height: modelBox?.height ?? 0, opacity: modelBox && modelHovered !== null ? 1 : 0,
                  transition: "top 220ms cubic-bezier(0.23,1,0.32,1), height 220ms cubic-bezier(0.23,1,0.32,1), opacity 150ms ease" }} />
              {models.map((m, i) => {

                return (
                  <button key={m} type="button" ref={(el) => { modelRowRefs.current[i] = el; }}
                    onMouseDown={(e) => e.preventDefault()} onMouseEnter={() => setModelHovered(i)} onClick={() => { selectModel(m); inputRef.current?.focus(); }}
                    className="relative z-10 flex h-7.5 w-full items-center gap-2 rounded-[6px] px-2 text-left">
                    <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{modelLabel(m)}</span>
                    <span className="shrink-0 text-[11px] text-ink-3">{providerOf(m)}</span>
                    <span className={`shrink-0 text-ink ${m === model ? "" : "invisible"}`}><Icon size={13} strokeWidth={2.5}><path d="M20 6L9 17l-5-5" /></Icon></span>
                  </button>
                );
              })}
            </div>
            </>}
          </div>
        )}

        <div className="relative isolate flex flex-col gap-1.5 overflow-hidden rounded-[14px] border border-line bg-surface p-1.5 shadow-card transition-[border-color] duration-150 focus-within:border-line-strong">
          <canvas ref={glimmRef} aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 h-full w-full" style={{ borderRadius: "inherit" }} />
          <span ref={measureRef} aria-hidden="true" className="pointer-events-none invisible absolute text-[13px] leading-[18px] whitespace-pre">{draft}</span>

          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-1.5 px-0.5 pt-0.5">
              {attachments.map((a, i) => (
                <span key={`${a.name}-${i}`} className="flex h-6.5 items-center gap-1.5 rounded-chip bg-field py-1 pr-1 pl-1 text-[11.5px] text-ink-2 shadow-hairline animate-pop-in">
                  <img src={a.url} alt="" className="size-4.5 rounded-[3px] object-cover" />
                  <span className="max-w-36 truncate">{a.name}</span>
                  <button type="button" aria-label={`Remove ${a.name}`} onClick={() => setAttachments((c) => c.filter((_, j) => j !== i))}
                    className="-my-1 flex size-6 items-center justify-center rounded-[5px] text-ink-3 transition-colors duration-100 hover:bg-line/70 hover:text-ink">
                    <Icon size={10} strokeWidth={2.5}><path d="M18 6L6 18M6 6l12 12" /></Icon>
                  </button>
                </span>
              ))}
            </div>
          )}

          <div ref={controlsRef} className={`grid items-end gap-x-1 gap-y-1.5 ${wide ? "grid-cols-[28px_auto_minmax(0,1fr)_28px_28px]" : "grid-cols-[28px_minmax(0,1fr)_auto_28px_28px]"}`}>
            <button type="button" aria-label="Add images or mention a subagent" aria-expanded={plusOpen}
              onClick={() => { setModelOpen(false); setPlusOpen((c) => !c); inputRef.current?.focus(); }}
              className={`${iconBtn} justify-self-start text-ink-3 hover:bg-hover hover:text-ink ${plusOpen ? "bg-hover text-ink" : ""} ${wide ? "col-start-1 row-start-2" : "col-start-1 row-start-1"}`}>
              <Icon size={16} strokeWidth={2}><path d="M12 5v14M5 12h14" /></Icon>
            </button>

            <textarea ref={inputRef} rows={1} value={draft} aria-label="Prompt"
              placeholder={listening ? "Listening…" : placeholder ?? "Write a message…"}
              onChange={(e) => { setDraft(e.target.value); setDismissed(false); setPlusOpen(false); }}
              onPaste={(e) => { const f = e.clipboardData.files; if (f.length) { e.preventDefault(); addFiles(f); } }}
              onKeyDown={(e) => {
                if (menu && rows.length > 0) {
                  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                    e.preventDefault();
                    setEngaged(true);
                    setActive((c) => (c + (e.key === "ArrowDown" ? 1 : rows.length - 1)) % rows.length);
                    return;
                  }
                  if ((e.key === "Enter" && !e.shiftKey) || e.key === "Tab") { e.preventDefault(); pick(rows[active]!); return; }
                }
                if (e.key === "Escape") { setDismissed(true); closeMenus(); return; }
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); }
              }}
              className={`min-h-7 w-full min-w-0 resize-none bg-transparent px-1 py-[5px] text-[13px] leading-[18px] text-ink outline-none [overflow-wrap:anywhere] placeholder:text-ink-3 ${wide ? "col-span-full col-start-1 row-start-1" : "col-start-2 row-start-1"}`} />

            {/* One model to use (a built-in assistant's): nothing to choose. */}
            {models.length < 2 ? <span className={`${wide ? "col-start-2 row-start-2 justify-self-start" : "col-start-3 row-start-1"}`} /> : (
              <button ref={modelRef} type="button" aria-expanded={modelOpen} aria-label="Choose model" title={model}
                onClick={() => { setPlusOpen(false); setPicker(onEffort ? "effort" : "models"); setModelOpen((c) => !c); }}
                className={`flex h-7 max-w-44 shrink-0 items-center gap-1 rounded-[8px] px-1.5 text-[12px] font-medium text-ink-2 transition-colors duration-150 hover:bg-hover hover:text-ink ${wide ? "col-start-2 row-start-2 justify-self-start" : "col-start-3 row-start-1"}`}>
                <span className="truncate">{modelLabel(model) || "Choose model"}{onEffort && <span className="font-normal text-ink-3"> {EFFORT_LABEL[effort ?? "medium"]}</span>}</span>
                <span className="text-ink-3"><Icon size={11} strokeWidth={2.4}><path d="M6 9l6 6 6-6" /></Icon></span>
              </button>
            )}

            <button type="button" aria-label={listening ? "Stop dictation" : "Start dictation"} aria-pressed={listening} disabled={!Speech}
              title={Speech ? "Dictate" : "Dictation isn't supported in this browser"}
              onClick={() => setListening((c) => !c)}
              className={`${iconBtn} disabled:opacity-40 ${listening ? "bg-accent-tint text-accent-ink" : "text-ink-3 hover:bg-hover hover:text-ink"} ${wide ? "col-start-4 row-start-2" : "col-start-4 row-start-1"}`}>
              {listening ? (
                <span className="flex h-3.5 items-center gap-[2.5px]">
                  {[0, 1, 2].map((i) => <span key={i} className="w-[2.5px] rounded-full bg-current" style={{ height: "100%", animation: `eq-bounce 900ms ease-in-out ${i * 150}ms infinite` }} />)}
                </span>
              ) : <Icon size={15} strokeWidth={2}><g><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3" /></g></Icon>}
            </button>

            {busy ? (
              <button type="button" aria-label="Stop" onClick={onStop} className={`${iconBtn} bg-ink text-surface ${wide ? "col-start-5 row-start-2" : "col-start-5 row-start-1"}`}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="5" width="14" height="14" rx="2" /></svg>
              </button>
            ) : (
              <button type="button" aria-label="Send" disabled={!canSend} onClick={send}
                className={`${iconBtn} duration-200 ${wide ? "col-start-5 row-start-2" : "col-start-5 row-start-1"}`}
                style={{ background: canSend ? "var(--ink)" : "var(--line-strong)", color: canSend ? "var(--surface)" : "var(--ink-2)" }}>
                <Icon size={16} strokeWidth={2.4}><path d="M12 19V5M5 12l7-7 7 7" /></Icon>
              </button>
            )}
          </div>
        </div>
      </div>
      {footer && <div className="mt-1.5 px-1.5 text-[12px] text-ink-3">{footer}</div>}
    </div>
  );
}

const STEPS: Effort[] = ["low", "medium", "high", "xhigh", "max"];
const KNOB = 16; // px; the track is this plus 4px around it, so the knob always sits inside

function EffortSlider({ value, onChange }: { value: Effort; onChange: (e: Effort) => void }) {
  const [dragAt, setDragAt] = useState<number | null>(null); // while dragging: shown, saved on release
  const at = dragAt ?? STEPS.indexOf(value); // -1: thinking is off
  const stepAt = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return Math.min(STEPS.length - 1, Math.max(0, Math.floor(((e.clientX - r.left) / r.width) * STEPS.length)));
  };
  // Step centres across the inner width, so the first and last land a knob's radius from the ends.
  const center = (i: number) => `calc(4px + ${KNOB / 2}px + (100% - ${KNOB + 8}px) / ${STEPS.length - 1} * ${i})`;
  return (
    <div role="slider" aria-label="Thinking time" aria-valuemin={0} aria-valuemax={STEPS.length - 1} aria-valuenow={at} aria-valuetext={at >= 0 ? EFFORT_LABEL[STEPS[at]!] : EFFORT_LABEL.off}
      tabIndex={0} onMouseDown={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
        if (d) { e.preventDefault(); onChange(STEPS[Math.min(STEPS.length - 1, Math.max(0, at + d))]!); }
      }}
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); setDragAt(stepAt(e)); }}
      onPointerMove={(e) => { if (dragAt !== null) setDragAt(stepAt(e)); }}
      onPointerUp={() => { if (dragAt !== null && STEPS[dragAt] !== value) onChange(STEPS[dragAt]!); setDragAt(null); }}
      onPointerCancel={() => setDragAt(null)}
      style={{ height: KNOB + 8 }}
      className="relative cursor-pointer touch-none rounded-full bg-field shadow-inset-field outline-none focus-visible:ring-2 focus-visible:ring-accent/40">
      <span aria-hidden className="absolute inset-y-1 left-1 rounded-full bg-accent transition-[width] duration-200 ease-out"
        style={{ width: at < 0 ? 0 : `calc(${center(at)} + ${KNOB / 2}px - 4px)` }} />
      {STEPS.map((e, i) => i !== at && (
        <span key={e} aria-hidden className={`absolute top-1/2 size-1.5 -translate-1/2 rounded-full ${i < at ? "bg-white/60" : "bg-ink-3"}`} style={{ left: center(i) }} />
      ))}
      {at >= 0 && (
        <span aria-hidden className="absolute top-1/2 -translate-1/2 rounded-full bg-surface shadow-btn transition-[left] duration-200 ease-out"
          style={{ left: center(at), width: KNOB, height: KNOB }} />
      )}
    </div>
  );
}
