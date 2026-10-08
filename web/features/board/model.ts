// Pure board operations and drop resolution (no React, no DOM) so they can be unit tested.
import type { Board } from "../../../shared/types";

export type Edge = "top" | "bottom" | "left" | "right";

/** What is being dragged (attached to the draggable as data). */
export type DragSource =
  | { type: "card"; cardId: string; listId: string; /** a GitHub list's row (cardId is its key): dropping it makes a card */ row?: true }
  | { type: "list"; listId: string };

/** What it is over (innermost drop target's data, plus the closest edge where relevant). */
export type DropTarget =
  | { type: "card"; cardId: string; listId: string; edge: Edge | null }
  | { type: "list-body"; listId: string }
  | { type: "list-top"; listId: string } // list header / "+ Add a card" area: drop at the top
  | { type: "list"; listId: string; edge: Edge | null }
  | { type: "placeholder" }; // hovering the placeholder itself: keep the current slot (prevents flicker)

/** Where a drop would land: a slot in a list, or a list position. */
export type DropResult =
  | { type: "card"; listId: string; index: number }
  | { type: "list"; index: number };

/**
 * Resolve a hover/drop. Card indices are positions in the destination list *without* the dragged card,
 * which is also where the placeholder renders. Returns null when nothing would change.
 */
export function resolveDrop(board: Board, source: DragSource, target: DropTarget | undefined, current: DropResult | null = null): DropResult | null {
  if (!target) return null;
  if (target.type === "placeholder") return current;

  if (source.type === "list") {
    if (target.type !== "list" || target.listId === source.listId) return null;
    const rest = board.lists.filter((l) => l.id !== source.listId);
    const at = rest.findIndex((l) => l.id === target.listId);
    const index = at + (target.edge === "right" ? 1 : 0);
    return index === board.lists.findIndex((l) => l.id === source.listId) ? null : { type: "list", index };
  }

  let listId: string, index: number;
  if (target.type === "card") {
    if (target.cardId === source.cardId) return null;
    listId = target.listId;
    const rest = cardsOf(board, listId).filter((c) => c !== source.cardId);
    index = rest.indexOf(target.cardId) + (target.edge === "bottom" ? 1 : 0);
  } else if (target.type === "list-body") {
    listId = target.listId;
    index = cardsOf(board, listId).filter((c) => c !== source.cardId).length;
  } else if (target.type === "list-top") {
    listId = target.listId;
    index = 0;
  } else return null;

  const unchanged = listId === source.listId && cardsOf(board, listId).indexOf(source.cardId) === index;
  return unchanged ? null : { type: "card", listId, index };
}

const cardsOf = (b: Board, listId: string) => b.lists.find((l) => l.id === listId)?.cards ?? [];

export const PLACEHOLDER = Symbol("placeholder");

/**
 * Items with the placeholder slotted in at `index`, counted among the items *other than* the dragged one
 * (the same index space resolveDrop uses). The dragged item stays in place; index < 0 means no placeholder.
 */
export function withPlaceholder<T>(items: T[], idOf: (item: T) => string, dragId: string | undefined, index: number): (T | typeof PLACEHOLDER)[] {
  if (index < 0) return items;
  const out: (T | typeof PLACEHOLDER)[] = [];
  let slot = 0;
  for (const item of items) {
    if (idOf(item) !== dragId) { if (slot === index) out.push(PLACEHOLDER); slot++; }
    out.push(item);
  }
  if (slot === index) out.push(PLACEHOLDER);
  return out;
}

/** Move a card to `index` (an index in the destination list without the card). */
export function moveCard(b: Board, cardId: string, toListId: string, index: number): Board {
  return {
    ...b,
    lists: b.lists.map((l) => {
      const cards = l.cards.filter((c) => c !== cardId);
      if (l.id === toListId) cards.splice(Math.max(0, Math.min(index, cards.length)), 0, cardId);
      return { ...l, cards };
    }),
  };
}

/** Move a list to `index` (an index among the other lists). */
export function moveList(b: Board, listId: string, index: number): Board {
  const list = b.lists.find((l) => l.id === listId);
  if (!list) return b;
  const rest = b.lists.filter((l) => l.id !== listId);
  rest.splice(Math.max(0, Math.min(index, rest.length)), 0, list);
  return { ...b, lists: rest };
}
