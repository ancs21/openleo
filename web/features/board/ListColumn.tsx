import { useEffect, useRef, useState } from "react";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import { draggable, dropTargetForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { autoScrollForElements } from "@atlaskit/pragmatic-drag-and-drop-auto-scroll/element";
import type { Card, List } from "../../../shared/types";
import { Icon, glyphs } from "../../components/Icon";
import { IconButton } from "../../components/IconButton";
import { MenuItem, Popover } from "../../components/Popover";
import { Confirm } from "../../components/Modal";
import { useApp } from "../../stores/app-store";
import { AgentIcon } from "../../components/AgentIcon";
import { CardView } from "./CardView";
import { GithubRows, GithubSourceDialog } from "./GithubList";
import { attachClosestEdge, tiltedPreview } from "./dnd";
import { PLACEHOLDER, withPlaceholder } from "./model";
import { Placeholder } from "./Placeholder";
import { useBoard } from "./store";

export function ListColumn({ list, cards, matches, onOpenTask }: {
  list: List; cards: Card[]; matches: (c: Card) => boolean; onOpenTask: (id: string) => void;
}) {
  const { renameList, deleteList, addTask, setAutomationList, setListSource } = useBoard();
  const [choosingSource, setChoosingSource] = useState(false);
  const agents = useApp((s) => s.agents);
  const listAgent = agents.find((a) => a.name === list.agent);
  const picking = useBoard((s) => s.pickingIcons.includes(list.id));
  const drag = useBoard((s) => s.drag);
  const col = useRef<HTMLDivElement>(null), head = useRef<HTMLDivElement>(null), body = useRef<HTMLDivElement>(null);
  const [adding, setAdding] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [menu, setMenu] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const tasks = cards.filter((c) => c.kind === "task").length;
  const dragging = drag?.kind === "list" && drag.id === list.id;

  useEffect(() => {
    const el = col.current!;
    return combine(
      draggable({
        element: el, dragHandle: head.current!, getInitialData: () => ({ type: "list", listId: list.id }),
        onGenerateDragPreview: ({ nativeSetDragImage, location }) => tiltedPreview({ element: el, input: location.current.input, nativeSetDragImage }, 1.5),
      }),
      // The whole column: a list target for list drags; for card drags its header area means "top of this list"
      // (cards and the body are inner targets, so they win wherever they are).
      dropTargetForElements({
        element: el,
        canDrop: ({ source }) => (source.data.type === "card" && !list.source) || (source.data.type === "list" && source.data.listId !== list.id),
        getData: ({ input, element, source }) => source.data.type === "card"
          ? { type: "list-top", listId: list.id }
          : attachClosestEdge({ type: "list", listId: list.id }, { input, element, allowedEdges: ["left", "right"] }),
      }),
      ...(body.current ? [ // a GitHub list holds no cards
        dropTargetForElements({ element: body.current, canDrop: ({ source }) => source.data.type === "card", getData: () => ({ type: "list-body", listId: list.id }) }),
        autoScrollForElements({ element: body.current }),
      ] : []),
    );
  }, [list.id, !!list.source]);

  const over = drag?.kind === "card" && drag.over?.type === "card" && drag.over.listId === list.id ? drag.over.index : -1;
  const rows = withPlaceholder(cards, (c) => c.id, drag?.id, over).map((c) => c === PLACEHOLDER
    ? <Placeholder key="placeholder" height={drag!.height} />
    : <CardView key={c.id} card={c} listId={list.id} hidden={!matches(c)} onOpenTask={onOpenTask} />);

  return (
    <div ref={col} className={`relative flex max-h-full w-[272px] shrink-0 flex-col rounded-[14px] bg-surface/80 shadow-raised backdrop-blur-xl transition-opacity ${dragging ? "opacity-35" : ""}`}>
      <div ref={head} className="flex h-11 shrink-0 cursor-grab items-center gap-2 px-3 active:cursor-grabbing">
        {picking ? <span aria-label="Choosing an icon" className="size-3.5 shrink-0 animate-pulse rounded-[4px] bg-hover-2" />
          : <ListIcon icon={list.icon} />}
        {renaming
          ? <input autoFocus defaultValue={list.title} aria-label="List name" onBlur={(e) => { renameList(list.id, e.target.value.trim() || list.title); setRenaming(false); }}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") (e.target as HTMLInputElement).blur(); }}
              className="h-7 min-w-0 flex-1 rounded-[6px] bg-field px-1.5 text-[14px] font-semibold text-ink outline-none" />
          : <button type="button" onDoubleClick={() => setRenaming(true)} title="Double-click to rename" className="min-w-0 flex-1 truncate text-left text-[14px] font-semibold text-ink">{list.title}</button>}
        {listAgent && (
          <span title={`New cards here go to ${listAgent.name}`} aria-label={`New cards go to ${listAgent.name}`} className="flex size-5.5 items-center justify-center rounded-[6px] bg-field text-ink-2 shadow-hairline">
            <AgentIcon icon={listAgent.icon} className="size-3" />
          </span>
        )}
        {list.source ? <span title={`GitHub: ${list.source.query}`} className="text-[11.5px] text-ink-3">GitHub</span> : <span className="text-[13px] text-ink-2 tabular-nums">{cards.length}</span>}
        <Popover open={menu} onClose={() => setMenu(false)} className="w-48" trigger={
          <IconButton size="sm" aria-label="List menu" aria-expanded={menu} onClick={() => setMenu((m) => !m)}><Icon size={15}>{glyphs.more}</Icon></IconButton>
        }>
          <MenuItem onClick={() => { setRenaming(true); setMenu(false); }}>Rename</MenuItem>
          {!list.source && <MenuItem icon={<Icon>{glyphs.flow}</Icon>} onClick={() => { setMenu(false); setAutomationList(list.id); }}>Automation…</MenuItem>}
          {list.source || !cards.length
            ? <MenuItem icon={<Icon>{glyphs.globe}</Icon>} onClick={() => { setMenu(false); setChoosingSource(true); }}>{list.source ? "Edit GitHub…" : "GitHub items…"}</MenuItem>
            : <p className="px-2 py-1.5 text-[12px] text-ink-3">Empty the list to show GitHub items.</p>}
          {list.source && <MenuItem onClick={() => { setMenu(false); setListSource(list.id); }}>Back to cards</MenuItem>}
          <MenuItem danger onClick={() => { setConfirming(true); setMenu(false); }}>
            Delete list{tasks ? ` (${tasks} task${tasks > 1 ? "s" : ""})` : ""}
          </MenuItem>
        </Popover>
        <GithubSourceDialog list={list} open={choosingSource} onClose={() => setChoosingSource(false)} />
        <Confirm open={confirming} onClose={() => setConfirming(false)} title={`Delete “${list.title}”?`} confirmLabel="Delete list" onConfirm={() => deleteList(list.id)}
          message={tasks ? `Its ${tasks} task${tasks > 1 ? "s are" : " is"} deleted too. This can't be undone.` : "This can't be undone."} />
      </div>
      {list.source ? <GithubRows list={list} /> : <>
      {adding
        ? <div className="px-2 pb-1.5"><textarea autoFocus rows={2} placeholder="Describe a task…" aria-label="New task"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); const v = e.currentTarget.value.trim(); if (v) addTask(list.id, v); e.currentTarget.value = ""; }
              if (e.key === "Escape") setAdding(false);
            }}
            onBlur={() => setAdding(false)}
            className="w-full resize-none rounded-[10px] bg-surface p-2.5 text-[13px] text-ink shadow-card outline-none placeholder:text-ink-3" /></div>
        : <button type="button" onClick={() => setAdding(true)} className="mx-2 mb-1 flex h-7 items-center rounded-[7px] px-1.5 text-[12.5px] text-ink-2 hover:bg-hover/70 hover:text-ink">+ Add a card</button>}
      <div ref={body} className="flex min-h-10 flex-col gap-2 overflow-y-auto rounded-b-[14px] px-2 pt-1 pb-2">{rows}</div>
      </>}
    </div>
  );
}

export const ListIcon = ({ icon, className = "size-3.5" }: { icon?: string; className?: string }) => icon
  ? <AgentIcon icon={icon} className={`${className} text-ink-2`} />
  : <Icon className={`${className} shrink-0 text-ink-2`}>{glyphs.file}</Icon>;
