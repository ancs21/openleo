// Kanban board: wallpaper, floating translucent lists, pill top bar, ⌘K search.
// Native drag & drop (Pragmatic DnD) with a tilted drag preview and a live placeholder where the drop lands.
import { usePanels } from "../../stores/panels";
import { useEffect, useRef, useState } from "react";
import { Outlet, useMatch, useNavigate, useParams } from "react-router";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import { monitorForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { autoScrollForElements } from "@atlaskit/pragmatic-drag-and-drop-auto-scroll/element";
import type { Card } from "../../../shared/types";
import { useApp } from "../../stores/app-store";
import { AddList } from "./AddList";
import { BoardTopBar } from "./BoardTopBar";
import { asSource, asTarget } from "./dnd";
import { Automation } from "./Automation";
import { play } from "../../lib/sounds";
import { ListColumn } from "./ListColumn";
import { PLACEHOLDER, resolveDrop, withPlaceholder } from "./model";
import { Placeholder } from "./Placeholder";
import { lastBoard, useBoard } from "./store";
import { useWallpaper, wallpaperBackground } from "../../lib/useWallpaper";
import { WallpaperCredit } from "../../components/WallpaperCredit";
import { CardPanel } from "./CardPanel";
import { BoardTable } from "./BoardTable";
import { Leo } from "./Leo";
import { storage } from "../../lib/storage";
import type { BoardView } from "./BoardTopBar";


export function BoardPage() {
  const agents = useApp((s) => s.agents);
  const { board, error, drag, load, addList, open, automationList } = useBoard();
  const [query, setQuery] = useState("");
  // The board and the open card live in the URL: /b/:boardId/card/:num
  const { boardId = lastBoard(), num } = useParams();
  const navigate = useNavigate();
  const openCard = Object.values(board?.cards ?? {}).find((c) => String(c.num) === num);
  const setOpenTask = (id: string | null) => {
    const c = id ? board?.cards[id] : undefined;
    navigate(c ? `/b/${boardId}/card/${c.num}` : `/b/${boardId}`);
  };
  const wallpaper = useWallpaper();
  const [view, setView] = useState<BoardView>(() => (storage.get("view") === "table" ? "table" : "board")); // per browser
  const chooseView = (v: BoardView) => { setView(v); storage.set("view", v); };
  const [leo, setLeo] = useState(false);
  const panelWidth = usePanels((s) => s.panelWidth);
  const agentsOpen = !!useMatch("/b/:boardId/agents/*");
  // Side panels, right to left: Leo, then the open card or the agents next to it. The board makes room for both.
  const leoSpace = leo && board ? panelWidth.leo + 12 : 0;
  const sideSpace = leoSpace + (openCard || agentsOpen ? panelWidth.card + 12 : 0);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => { void open(boardId); }, [open, boardId]);
  useEffect(() => { void load(); }, [load, agents.length]);

  // One monitor drives the drag: placeholder while hovering, then the move/run on drop.
  useEffect(() => combine(
    monitorForElements({
      onDragStart({ source }) {
        const s = asSource(source.data);
        play("press"); // picked up
        useBoard.getState().setDrag({ kind: s.type, id: s.type === "card" ? s.cardId : s.listId, height: source.element.offsetHeight, width: source.element.offsetWidth, over: null });
      },
      onDrag({ source, location }) {
        const { board, drag, setDrag } = useBoard.getState();
        if (!board || !drag) return;
        const over = resolveDrop(board, asSource(source.data), asTarget(location.current.dropTargets[0]?.data), drag.over);
        if (over !== drag.over && JSON.stringify(over) !== JSON.stringify(drag.over)) setDrag({ ...drag, over });
      },
      onDrop({ source, location }) {
        const { board, drag, setDrag, moveCard, moveList, addRow } = useBoard.getState();
        setDrag(undefined);
        if (!board) return;
        const s = asSource(source.data);
        const r = resolveDrop(board, s, asTarget(location.current.dropTargets[0]?.data), drag?.over ?? null);
        if (!r) return;
        if (r.type === "card" && s.type === "card" && s.row) void addRow(s.listId, s.cardId, r.listId, r.index);
        else if (r.type === "card" && s.type === "card") moveCard(s.cardId, r.listId, r.index);
        else if (r.type === "list" && s.type === "list") moveList(s.listId, r.index);
        else return;
        play("tick"); // dropped in a new place
      },
    }),
    autoScrollForElements({ element: scroller.current! }),
  ), []);

  const q = query.trim().toLowerCase();
  const matches = (c: Card) => !q || `#${c.num}` === q ||
    `${c.title} ${c.notes} ${c.result ?? ""}`.toLowerCase().includes(q);
  // A plain wheel over the board background scrolls sideways (lists keep scrolling their own cards).
  const wheelSideways = (e: React.WheelEvent<HTMLDivElement>) => {
    const el = scroller.current;
    if (!el || e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    const list = (e.target as HTMLElement).closest(".overflow-y-auto");
    if (list && list.scrollHeight > list.clientHeight) return;
    el.scrollLeft += e.deltaY;
  };

  // Lists, with a placeholder where a dragged list would land.
  const listOver = drag?.kind === "list" && drag.over?.type === "list" ? drag.over.index : -1;
  const columns = withPlaceholder(board?.lists ?? [], (l) => l.id, drag?.id, listOver).map((l) => l === PLACEHOLDER
    ? <Placeholder key="placeholder" height={Math.min(drag!.height, 240)} width={drag!.width} />
    : <ListColumn key={l.id} list={l} cards={l.cards.map((id) => board!.cards[id]!).filter(Boolean)} matches={matches} onOpenTask={setOpenTask} />);

  return (
    <div className="relative h-full overflow-hidden transition-[background] duration-500"
      style={{ background: wallpaperBackground(wallpaper) }}>
      <BoardTopBar query={query} onQuery={setQuery} wallpaper={wallpaper} view={view} onView={chooseView} onLeo={() => setLeo((o) => !o)} />
      <div ref={scroller} onWheel={wheelSideways}
        className={`absolute inset-0 top-14 flex items-start gap-3 px-3 pb-3 ${view === "table" ? "overflow-y-auto" : "overflow-x-auto"}`}
        style={sideSpace ? { paddingRight: `min(${sideSpace + 12}px, 100% - 24px)` } : undefined}>
        {!board && <div className="m-auto text-[13px] text-white/80">{error ?? "Loading board…"}</div>}
        {board && view === "table" ? <BoardTable matches={matches} onOpenTask={setOpenTask} /> : <>
          {columns}
          {board && <AddList onAdd={addList} />}
        </>}
      </div>
      <WallpaperCredit photo={wallpaper.photo} className="absolute bottom-2 left-3 z-10" />
      {error && board && <div role="alert" className="absolute bottom-3 left-1/2 z-30 -translate-x-1/2 rounded-full bg-red px-3 py-1.5 text-[12.5px] font-medium text-white shadow-overlay">{error}</div>}
      {openCard && <CardPanel card={openCard} agents={agents} offset={leoSpace} onClose={() => setOpenTask(null)} />}
      <Outlet context={{ offset: leoSpace }} />
      {leo && board && <Leo escape={!openCard && !agentsOpen} onClose={() => setLeo(false)} />}
      {automationList && <Automation listId={automationList} onOpenTask={setOpenTask} />}
    </div>
  );
}
