import { useEffect, useRef } from "react";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import { draggable, dropTargetForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { taskAgents, type Card, type TaskCard } from "../../../shared/types";
import { describeSchedule } from "../../../shared/schedule";
import { Icon, glyphs } from "../../components/Icon";
import { Shimmer } from "../../components/motion";
import { attachClosestEdge, tiltedPreview } from "./dnd";
import { useBoard } from "./store";
import { FieldChips } from "./CardFields";
import { useApp } from "../../stores/app-store";
import { AgentIcon } from "../../components/AgentIcon";

/** Coloured status label used on cards and in the card panel. */
export function StatusPill({ status }: { status: TaskCard["status"] }) {
  return (
    <span className={`inline-flex h-5.5 w-fit items-center gap-1 rounded-[6px] px-1.5 text-[11.5px] font-medium ${STATUS[status].cls}`}>
      {status === "running" && <span className="size-1.5 animate-pulse-dot rounded-full bg-white" />}
      {STATUS[status].label}
    </span>
  );
}

const STATUS: Record<TaskCard["status"], { label: string; cls: string }> = {
  todo: { label: "Todo", cls: "bg-field text-ink-2 shadow-hairline" },
  running: { label: "Working", cls: "bg-accent text-white" },
  done: { label: "Done", cls: "bg-green text-white" },
  error: { label: "Error", cls: "bg-red text-white" },
};

export function CardView({ card, listId, hidden, onOpenTask }: {
  card: Card; listId: string; hidden: boolean; onOpenTask: (id: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const dragging = useBoard((s) => s.drag?.kind === "card" && s.drag.id === card.id);
  const agents = useApp((s) => s.agents);

  useEffect(() => {
    const data = { type: "card", cardId: card.id, listId };
    const el = ref.current!;
    return combine(
      draggable({ element: el, getInitialData: () => data, onGenerateDragPreview: ({ nativeSetDragImage, location }) => tiltedPreview({ element: el, input: location.current.input, nativeSetDragImage }) }),
      dropTargetForElements({
        element: el,
        canDrop: ({ source }) => source.data.type === "card" && source.data.cardId !== card.id,
        getData: ({ input, element }) => attachClosestEdge(data, { input, element, allowedEdges: ["top", "bottom"] }),
      }),
    );
  }, [card.id, listId]);

  if (hidden) return <div ref={ref} className="hidden" />;
  const open = () => onOpenTask(card.id);

  return (
    <div ref={ref} role="button" tabIndex={0} onClick={open} onKeyDown={(e) => { if (e.key === "Enter") open(); }}
      aria-label={`Task #${card.num}: ${card.title}`}
      className={`relative cursor-grab rounded-[10px] bg-surface p-3 text-left shadow-card transition-[opacity,box-shadow] duration-150 hover:shadow-raised active:cursor-grabbing ${dragging ? "opacity-35" : ""}`}>
      <div className="text-[12px] text-ink-3 tabular-nums">#{card.num}</div>
      <p className="mt-0.5 line-clamp-3 text-[14px] text-ink">{card.title}</p>
      <div className="mt-2 empty:hidden"><FieldChips card={card} /></div>
      <div className="mt-2 flex flex-wrap items-center gap-1">
        {!(card.source === "welcome" && card.status === "todo") && <StatusPill status={card.status} />}
        <span className="flex-1" />
        {card.schedule && (
          <span title={`${card.schedule.paused ? "Paused: " : ""}${describeSchedule(card.schedule)}`} aria-label="Runs on a schedule"
            className={`flex size-5.5 items-center justify-center rounded-[6px] bg-field shadow-hairline ${card.schedule.paused ? "text-ink-3" : "text-accent-ink"}`}>
            <Icon size={12} strokeWidth={2.2}>{glyphs.repeat}</Icon>
          </span>
        )}
        {/* The agents that worked on it, as icons on the right (name on hover). */}
        {taskAgents(card).map((name) => (
          <span key={name} title={name} aria-label={`Agent ${name}`} className="flex size-5.5 items-center justify-center rounded-[6px] bg-field text-ink-2 shadow-hairline">
            <AgentIcon icon={agents.find((a) => a.name === name)?.icon} className="size-3" />
          </span>
        ))}
      </div>
      {card.status === "running" && <div className="mt-1.5 text-[12.5px]"><Shimmer>{`${card.agent} is working on it…`}</Shimmer></div>}
    </div>
  );
}
