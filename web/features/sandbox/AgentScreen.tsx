// Card/dock: a snapshot preview of the sandbox screen (~every 1.5s). Open: cua's own viewer (hardware video + full input)
// embedded same-origin via /sbviewer. "Teach a task" records keyframes while you drive, and End hands them
// to the agent as a demonstration.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Button } from "../../components/Button";
import { glyphs } from "../../components/Icon";
import { IconButton } from "../../components/IconButton";
import { useEscape } from "../../lib/hooks";

const PREVIEW_MS = 1500;
const REC_MS = 1500; // keyframe capture interval while recording
const MAX_FRAMES = 40; // ring buffer while recording
const KEYFRAMES = 6; // sent to the model on End

const Ico = ({ path, size = 15 }: { path: ReactNode; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>{path}</svg>
);
const recIcon = <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="3.5" fill="currentColor" stroke="none" /></>;
const popIcon = <><path d="M14 4h6v6" /><path d="M20 4l-8 8" /><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" /></>;
const fmt = (t: number) => `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;

function LoadingScreen({ label = "Connecting to agent's screen" }: { label?: string }) {
  const size = 26, stroke = 2, r = (size - stroke) / 2, c = 2 * Math.PI * r;
  return (
    <div className="absolute inset-0 bg-black">
      <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
        <svg width={size} height={size} className="block animate-spin-fast" aria-hidden>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth={stroke} />
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#fff" strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${c * 0.28} ${c * 0.72}`} />
        </svg>
      </span>
      <span className="absolute inset-x-0 px-3 text-center text-[12.5px] font-medium text-white/70" style={{ top: "calc(50% + 28px)" }}>{label}</span>
    </div>
  );
}

/**
 * Live preview: a fresh JPEG snapshot every `ms` while the tab is visible. Short requests on purpose:
 * long-lived MJPEG streams each hold one of the browser's ~6 connections per host and starve other requests.
 */
function useSnapshot(url: string, ms: number) {
  const [src, setSrc] = useState<string>();
  const [error, setError] = useState(false);
  useEffect(() => {
    let stop = false, timer: ReturnType<typeof setTimeout>, prev: string | undefined;
    const tick = async () => {
      if (document.visibilityState === "visible") {
        try {
          const r = await fetch(`${url}${url.includes("?") ? "&" : "?"}t=${Date.now()}`, { cache: "no-store" });
          if (!r.ok) throw new Error(String(r.status));
          const next = URL.createObjectURL(await r.blob());
          if (stop) return URL.revokeObjectURL(next);
          setSrc(next); setError(false);
          if (prev) URL.revokeObjectURL(prev);
          prev = next;
        } catch { if (!stop) setError(true); }
      }
      if (!stop) timer = setTimeout(tick, ms);
    };
    void tick();
    return () => { stop = true; clearTimeout(timer); if (prev) URL.revokeObjectURL(prev); };
  }, [url, ms]);
  return { src, ready: !!src, error };
}

/** While recording, capture a keyframe every REC_MS (even if the tab is hidden). */
function useRecorder(recording: boolean, board: string) {
  const frames = useRef<string[]>([]);
  useEffect(() => {
    if (!recording) return;
    let lastSize = -1;
    const id = setInterval(async () => {
      const r = await fetch(`/api/sandbox/screen?board=${encodeURIComponent(board)}&t=${Date.now()}`, { cache: "no-store" }).catch(() => null);
      if (!r?.ok) return;
      const blob = await r.blob();
      if (blob.size === lastSize) return; // nothing changed
      lastSize = blob.size;
      const url = await new Promise<string>((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result as string); fr.readAsDataURL(blob); });
      frames.current.push(url);
      if (frames.current.length > MAX_FRAMES) frames.current.shift();
    }, REC_MS);
    return () => clearInterval(id);
  }, [recording, board]);
  return frames;
}

export default function AgentScreen({ agentName, board = "main", onInteract, onTeach, variant = "card", status }: {
  agentName: string;
  /** whose computer to show */
  board?: string;
  /** "card": framed preview with an Open pill. "dock": small thumbnail + status that docks above the composer. */
  variant?: "card" | "dock";
  /** dock only: what the agent is doing ("Working", "Idle"…) */
  status?: ReactNode;
  /** pop out cua's full viewer in a new tab (video, audio, file drop) */
  onInteract: () => void;
  /** recording ended: evenly spaced keyframes of what you did, and its length */
  onTeach: (keyframes: string[], seconds: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [secs, setSecs] = useState(0);
  const card = useSnapshot(`/api/sandbox/screen?board=${encodeURIComponent(board)}`, PREVIEW_MS);
  const frames = useRecorder(recording, board);

  useEffect(() => {
    if (!recording) return;
    const id = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [recording]);

  const start = () => { frames.current = []; setSecs(0); setRecording(true); setOpen(true); };
  const end = () => {
    setRecording(false);
    const all = frames.current;
    const n = Math.min(KEYFRAMES, all.length);
    const picks = Array.from({ length: n }, (_, i) => all[Math.round((i * (all.length - 1)) / Math.max(1, n - 1))]!);
    if (picks.length) onTeach(picks, secs);
    frames.current = [];
  };

  const recBadge = recording && (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-red-tint py-0.5 pr-2 pl-1.5 text-[11.5px] font-medium text-red tabular-nums">
      <span className="size-2 rounded-full bg-red animate-pulse-dot" />
      {fmt(secs)}
    </span>
  );

  const teach = (
    <>
      {recording ? (
        <button type="button" onClick={end} data-sound="release"
          className="inline-flex h-[27px] items-center gap-1.5 rounded-full bg-red pr-3 pl-2.5 text-[13px] leading-none font-medium text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.14)] transition-[transform,filter] duration-150 hover:brightness-95 active:scale-[0.96]">
          <span className="size-2.5 rounded-[2px] bg-white" />End
        </button>
      ) : (
        <Button className="h-7 gap-1 pl-1.5 text-[12.5px]" onClick={start} title="Drive the desktop yourself while it records; the agent learns from it">
          <Ico path={recIcon} />Teach a task
        </Button>
      )}
    </>
  );

  const rec = recording && <span className="absolute top-1.5 left-1.5 rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-white">● REC {fmt(secs)}</span>;
  const preview = variant === "dock" ? (
    <div className="flex items-center gap-3">
      <button type="button" aria-label={`Open ${agentName}'s computer`} title="Open to watch or take over" onClick={() => card.ready && setOpen(true)}
        className="group/screen relative -mt-7 aspect-[16/10] w-[104px] shrink-0 animate-fade-up overflow-hidden rounded-[10px] bg-inset shadow-raised ring-1 ring-line transition-transform duration-150 hover:-translate-y-0.5">
        {!open && card.src && <img src={card.src} alt="" className="absolute inset-0 h-full w-full object-cover" />}
        {!card.ready && <span className="absolute inset-0 flex items-center justify-center"><span className="size-3.5 animate-spin-fast rounded-full border-[1.5px] border-line-strong border-t-ink-2" /></span>}
        <span className="absolute inset-0 flex items-center justify-center bg-black/0 text-white opacity-0 transition duration-150 group-hover/screen:bg-black/30 group-hover/screen:opacity-100">
          <Ico size={16} path={glyphs.expand} />
        </span>
        {rec}
      </button>
      <span className="flex min-w-0 items-center gap-2 text-[14px] font-medium text-ink">{status}</span>
    </div>
  ) : (
    <>
      <div className="group/screen relative aspect-[16/10] cursor-pointer overflow-hidden rounded-[14px] bg-inset shadow-card transition-shadow duration-150 hover:shadow-raised animate-fade-up"
        onClick={() => card.ready && setOpen(true)}>
        {!open && card.src && <img src={card.src} alt={`${agentName}'s screen, live`} className="absolute inset-0 h-full w-full object-cover" />}
        {!card.ready && <LoadingScreen label={card.error ? "Screen unavailable, retrying…" : undefined} />}
        {card.ready && (
          <div className="absolute inset-0 flex items-center justify-center bg-[rgba(17,19,24,0)] transition-colors duration-150 group-hover/screen:bg-[rgba(17,19,24,0.18)]">
            <span className="translate-y-1 opacity-0 transition duration-150 group-hover/screen:translate-y-0 group-hover/screen:opacity-100">
              <Button variant="accent" className="h-7 gap-1 px-2.5 text-[12.5px]" onClick={(e) => { e.stopPropagation(); setOpen(true); }}>
                <Ico size={14} path={glyphs.expand} />Open
              </Button>
            </span>
          </div>
        )}
        {rec}
      </div>
      <div className="mt-2 flex items-center gap-2 px-0.5">
        <span className="truncate text-[13px] font-medium text-ink">{agentName}'s screen</span>
        {card.ready && <span className="flex items-center gap-1 text-[11px] text-ink-3"><span className="size-1.5 rounded-full bg-green" />live</span>}
      </div>

    </>
  );

  return (
    <div className={variant === "card" ? "w-full max-w-[300px]" : ""}>
      {preview}
      {open && <ScreenDialog title={agentName} board={board} badge={recBadge} actions={teach} onPopOut={onInteract} onClose={() => setOpen(false)} />}
    </div>
  );
}

/**
 * A board's computer, full size: the live viewer you can click into and drive. `actions` go before the
 * pop-out and collapse buttons (e.g. Teach a task).
 */
export function ScreenDialog({ title, board, badge, actions, onPopOut, onClose }: {
  title: string; board: string; badge?: ReactNode; actions?: ReactNode; onPopOut: () => void; onClose: () => void;
}) {
  const [embed, setEmbed] = useState<string>();
  const [embedErr, setEmbedErr] = useState<string>();

  // Mint a fresh viewer ticket each time the viewer opens.
  useEffect(() => {
    let gone = false;
    fetch(`/api/sandbox/viewer?board=${encodeURIComponent(board)}`, { method: "POST" })
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error); if (!gone) setEmbed(j.embed); })
      .catch((e) => !gone && setEmbedErr((e as Error).message));
    return () => { gone = true; };
  }, [board]);

  // Esc collapses (when focus is outside the embedded viewer; inside it, keys belong to the sandbox).
  useEscape(onClose, { exclusive: true }); // only the viewer closes, not panels under it
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6" role="dialog" aria-modal="true" aria-label={`${title}'s screen`}>
      <div className="absolute inset-0 bg-black/60 dark:bg-black/75 animate-fade-in" onClick={onClose} />
      <div className="relative flex max-h-full flex-col overflow-hidden rounded-[16px] bg-surface p-2 pt-0 shadow-overlay animate-pop-in">
        <div className="flex h-11 shrink-0 items-center justify-between gap-3 px-1.5">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-[13px] font-semibold text-ink">{title}</span>
            {badge}
            <span className="hidden truncate text-[12px] text-ink-3 sm:inline">You're in control: click into the screen to drive it</span>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {actions}
            <IconButton size="sm" aria-label="Pop out full viewer" title="Open the full viewer in a new tab" onClick={onPopOut}><Ico path={popIcon} /></IconButton>
            <IconButton size="sm" aria-label="Collapse" onClick={onClose}><Ico path={glyphs.collapse} /></IconButton>
          </div>
        </div>
        <div className="relative min-h-0 overflow-hidden rounded-[8px] bg-black" data-sound-silent
          style={{ width: "min(1100px, 92vw)", aspectRatio: "16 / 10", maxHeight: "calc(100vh - 150px)" }}>
          {embed && <iframe src={embed} title={`${title}'s screen`} className="absolute inset-0 h-full w-full border-0"
            allow="clipboard-read; clipboard-write; autoplay; fullscreen; microphone" />}
          {!embed && <LoadingScreen label={embedErr ? `Viewer unavailable: ${embedErr}` : undefined} />}
        </div>
      </div>
    </div>,
    document.body,
  );
}
