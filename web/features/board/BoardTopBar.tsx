import { useEffect, useRef, useState } from "react";
import { agentLabel } from "../../../shared/types";
import { Link, useNavigate } from "react-router";
import { Icon, glyphs } from "../../components/Icon";
import { Logo } from "../../components/Logo";
import { MenuItem, Popover } from "../../components/Popover";
import { Confirm } from "../../components/Modal";
import { Shimmer } from "../../components/motion";
import { useHotkey } from "../../lib/hooks";
import { ThemeSwitch } from "../../components/ThemeSwitch";
import { api } from "../../lib/api";
import { useApp } from "../../stores/app-store";
import { MAIN_BOARD, useBoard } from "./store";
import { BoardSettings } from "./BoardSettings";
import { Dialog } from "../../components/Dialog";
import type { useWallpaper } from "../../lib/useWallpaper";
import { WallpaperPicker } from "./WallpaperPicker";
import { ChatGPTCard } from "../auth/ChatGPTCard";
import { OtherDevicesCard } from "../auth/OtherDevicesCard";
import { SoundToggle } from "../../components/SoundToggle";
import { AgentIcon } from "../../components/AgentIcon";
import { ScreenDialog } from "../sandbox/AgentScreen";

const pill = "inline-flex h-8 shrink-0 items-center whitespace-nowrap gap-1.5 rounded-full bg-surface/85 px-3 text-[13px] font-medium text-ink shadow-btn backdrop-blur-xl transition-colors duration-100 hover:bg-surface";

function BoardSwitcher({ wallpaper }: { wallpaper: ReturnType<typeof useWallpaper> }) {
  const { boards, boardId, board, loadBoards, createBoard, deleteBoard } = useBoard();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"list" | "new">("list");
  const [settings, setSettings] = useState(false);
  const [background, setBackground] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [text, setText] = useState("");
  const [limit, setLimit] = useState<{ used: number; max: number }>(); // only for accounts with limits
  useEffect(() => { void loadBoards(); }, [loadBoards]);
  useEffect(() => {
    if (!open) return setMode("list");
    api<{ unlimited: boolean; boards: { used: number; max: number } }>("/api/limits").then((l) => setLimit(l.unlimited ? undefined : l.boards), () => {});
  }, [open]);
  const full = !!limit && limit.used >= limit.max;
  const title = board?.title ?? boards.find((b) => b.id === boardId)?.title ?? "Board";
  const submit = async () => {
    if (text.trim()) { const b = await createBoard(text); setOpen(false); navigate(`/b/${b.id}`); }
  };
  return (
    <>
      <Popover open={open} onClose={() => setOpen(false)} align="left" className="w-64" trigger={
        <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className={`${pill} max-w-56`}>
          <Icon>{glyphs.board}</Icon><span className="truncate">{title}</span><Icon size={12}>{glyphs.chevron}</Icon>
        </button>
      }>
        {mode === "list" && <>
          {boards.map((b) => (
            <MenuItem key={b.id} to={`/b/${b.id}`} checked={b.id === boardId} onClick={() => setOpen(false)}>{b.title}</MenuItem>
          ))}
          <div className="my-1 border-t border-line" />
          <MenuItem icon={<Icon>{glyphs.plus}</Icon>} disabled={full} onClick={() => { setText(""); setMode("new"); }}
            title={full ? "Board limit reached: delete a board to add another" : undefined}
            extra={limit && <span className="text-[11px] font-normal text-ink-3 tabular-nums">{limit.used} of {limit.max}</span>}>New board</MenuItem>
          <MenuItem icon={<Icon>{glyphs.settings}</Icon>} onClick={() => { setOpen(false); setSettings(true); }}>Board settings…</MenuItem>
          <MenuItem icon={<Icon>{glyphs.image}</Icon>} onClick={() => { setOpen(false); setBackground(true); }}>Change background…</MenuItem>
          {boardId !== MAIN_BOARD && <MenuItem danger icon={<Icon>{glyphs.close}</Icon>} onClick={() => { setOpen(false); setConfirming(true); }}>Delete board</MenuItem>}
        </>}
        {mode === "new" && (
          <form className="flex flex-col gap-2 p-1.5" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
            <span className="text-[12px] font-medium text-ink-2">New board (gets its own computer)</span>
            <input autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="Marketing" aria-label="Board name"
              className="h-8 rounded-control bg-field px-2.5 text-[13px] text-ink shadow-inset-field outline-none focus:ring-2 focus:ring-accent/40" />
            <div className="flex justify-end gap-1.5">
              <button type="button" onClick={() => setMode("list")} className="h-7 rounded-control px-2.5 text-[12.5px] text-ink-2 hover:bg-hover">Cancel</button>
              <button type="submit" disabled={!text.trim()} className="h-7 rounded-control bg-ink px-2.5 text-[12.5px] font-medium text-surface disabled:opacity-50">Create</button>
            </div>
          </form>
        )}
      </Popover>
      {settings && <BoardSettings onClose={() => setSettings(false)} />}
      {background && (
        <Dialog title="Change background" onClose={() => setBackground(false)} className="w-[min(560px,calc(100vw-32px))]">
          <div className="min-h-0 overflow-y-auto pb-1">
            <WallpaperPicker theme={wallpaper.theme} current={wallpaper.photo} onChoose={wallpaper.choose} onAuto={wallpaper.reset}
              onCustom={(url) => { if (/^https?:\/\//.test(url)) wallpaper.choose({ custom: url }); }} />
          </div>
        </Dialog>
      )}
      <Confirm open={confirming} onClose={() => setConfirming(false)} title={`Delete “${title}”?`} confirmLabel="Delete board"
        message="Its cards are deleted. Its computer is paused and keeps its files." onConfirm={async () => { await deleteBoard(); navigate(`/b/${MAIN_BOARD}`); }} />
    </>
  );
}

function AgentsMenu() {
  const agents = useApp((s) => s.agents);
  const boardId = useBoard((s) => s.boardId);
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onClose={() => setOpen(false)} align="left" className="w-64" trigger={
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className={pill}>
        <AgentIcon />Manage agents<Icon size={12}>{glyphs.chevron}</Icon>
      </button>
    }>
      {agents.map((a) => <MenuItem key={a.name} to={`/b/${boardId}/agents/${a.name}`} icon={<AgentIcon icon={a.icon} />} onClick={() => setOpen(false)}>{agentLabel(a)}</MenuItem>)}
      {agents.length > 0 && <div className="my-1 border-t border-line" />}
      <MenuItem to={`/b/${boardId}/agents/new`} icon={<Icon>{glyphs.plus}</Icon>} onClick={() => setOpen(false)}>New agent</MenuItem>
    </Popover>
  );
}

function ComputerButton() {
  const { computer, boardId, board, startComputer } = useBoard();
  const openViewer = useApp((s) => s.openViewer);
  const { setupNeeded, setSetup } = useApp();
  const [open, setOpen] = useState(false);
  const state = computer?.state ?? "off";
  // No computer on this Mac yet: the button leads to setup instead of a retry that can't work.
  const press = () => (state === "running" ? setOpen(true) : setupNeeded ? setSetup({ setupOpen: true }) : void startComputer());
  const dot = { running: "bg-green", starting: "bg-accent animate-pulse-dot", error: "bg-red", off: "bg-ink-3" }[state];
  const label = setupNeeded && state !== "running" ? "Set up computer" : { running: "Computer", starting: "Starting computer…", error: "Computer · retry", off: "Start computer" }[state];
  return (
    <>
      <button type="button" className={pill} disabled={state === "starting"}
        title={computer?.error ?? `This board's computer${computer?.name ? ` (${computer.name})` : ""}: ${state}`}
        onClick={press}>
        <Icon>{glyphs.monitor}</Icon>
        {state === "starting" ? <Shimmer>{label}</Shimmer> : label}
        <span className={`size-2 rounded-full ${dot}`} />
      </button>
      {open && <ScreenDialog title={board?.title ?? "Computer"} board={boardId} onPopOut={() => void openViewer(boardId)} onClose={() => setOpen(false)} />}
    </>
  );
}

function AccountMenu({ email }: { email?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onClose={() => setOpen(false)} className="flex w-72 flex-col gap-2 p-2" trigger={
      <button type="button" aria-label="Account" aria-expanded={open} title={email ? `ChatGPT: ${email}` : "Account"} onClick={() => setOpen((o) => !o)}
        className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-[12px] font-semibold text-white shadow-btn">
        {email ? email.slice(0, 2).replace(/^./, (c) => c.toUpperCase())
          : <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="8" r="4" /><path d="M4 20a8 8 0 0 1 16 0z" /></svg>}
      </button>
    }>
      <ChatGPTCard />
      <OtherDevicesCard />
      <div className="flex items-center justify-between gap-3 px-2 text-[12.5px] text-ink-2">
        Theme <ThemeSwitch className="w-[108px]" />
      </div>
      <SoundToggle />
    </Popover>
  );
}

export type BoardView = "board" | "table";

export function BoardTopBar({ query, onQuery, wallpaper, view, onView, onLeo }: {
  query: string; onQuery: (q: string) => void; wallpaper: ReturnType<typeof useWallpaper>; view: BoardView; onView: (v: BoardView) => void; onLeo: () => void;
}) {
  const sandboxed = useApp((s) => !!s.sandbox?.sandboxed);
  const email = useApp((s) => s.chatgpt.email);
  const search = useRef<HTMLInputElement>(null);

  useHotkey("k", () => search.current?.focus());

  return (
    <header className="absolute inset-x-0 top-0 z-20 flex h-14 items-center gap-2 px-3">
      {/* The bare mark, in the theme's colours; a thin edge of the opposite colour keeps it clear on any wallpaper. */}
      <Link to="/" aria-label="OpenLeo" title="OpenLeo" className="flex shrink-0 rounded-full shadow-md ring-2 ring-surface/70 transition-transform duration-100 hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
        <Logo className="size-8" />
      </Link>
      <BoardSwitcher wallpaper={wallpaper} />
      <AgentsMenu />
      {sandboxed && <ComputerButton />}
      <div role="group" aria-label="View" className="flex h-8 shrink-0 items-center gap-0.5 rounded-full bg-surface/85 p-0.5 shadow-btn backdrop-blur-xl">
        {(["board", "table"] as const).map((v) => (
          <button key={v} type="button" aria-pressed={view === v} title={v === "board" ? "Board" : "Table"} aria-label={v === "board" ? "Board view" : "Table view"} onClick={() => onView(v)}
            className={`flex h-7 w-8 items-center justify-center rounded-full transition-[background-color,box-shadow,color] duration-200 ${view === v ? "bg-surface text-ink shadow-btn" : "text-ink-2 hover:bg-hover"}`}>
            <Icon size={14}>{v === "board" ? glyphs.board : glyphs.table}</Icon>
          </button>
        ))}
      </div>
      <div className="mx-auto flex h-8 w-full min-w-0 max-w-[460px] items-center gap-2 rounded-full bg-surface/85 px-3 text-ink-3 shadow-btn backdrop-blur-xl focus-within:bg-surface">
        <Icon>{glyphs.search}</Icon>
        <input ref={search} value={query} onChange={(e) => onQuery(e.target.value)} placeholder="Search" aria-label="Search cards"
          onKeyDown={(e) => { if (e.key === "Escape") { onQuery(""); e.currentTarget.blur(); } }}
          className="min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-3" />
        <kbd className="font-sans text-[11px] text-ink-3 max-sm:hidden">⌘K</kbd>
      </div>
      <button type="button" onClick={onLeo} title="Leo manages this board for you" className={`${pill} shrink-0`}>
        <Logo className="size-4" />Ask Leo
      </button>
      <AccountMenu email={email} />
    </header>
  );
}
