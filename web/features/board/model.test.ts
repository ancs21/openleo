import { expect, test } from "bun:test";
import type { Board } from "../../../shared/types";
import { moveCard, moveList, PLACEHOLDER, resolveDrop, withPlaceholder, type DragSource } from "./model";

const board = (): Board => ({
  title: "Test", nextNum: 6,
  lists: [
    { id: "A", title: "Ideas", cards: ["a1", "a2"] },
    { id: "T", title: "Todo", cards: ["t1", "t2", "t3"] },
    { id: "D", title: "Done", cards: [] },
  ],
  cards: {
    a1: { id: "a1", num: 1, kind: "task", title: "idea one", notes: "", status: "todo" },
    a2: { id: "a2", num: 2, kind: "task", title: "idea two", notes: "", status: "todo" },
    t1: { id: "t1", num: 3, kind: "task", title: "one", notes: "", status: "todo" },
    t2: { id: "t2", num: 4, kind: "task", title: "two", notes: "", status: "todo" },
    t3: { id: "t3", num: 5, kind: "task", title: "three", notes: "", status: "todo" },
  },
});
const task = (cardId: string): DragSource => ({ type: "card", cardId, listId: "T" });
const order = (b: Board, id: string) => b.lists.find((l) => l.id === id)!.cards;

test("reorder within a list: dropping t1 below t2 lands it after t2", () => {
  const b = board();
  const r = resolveDrop(b, task("t1"), { type: "card", cardId: "t2", listId: "T", edge: "bottom" });
  expect(r).toEqual({ type: "card", listId: "T", index: 1 });
  expect(order(moveCard(b, "t1", "T", 1), "T")).toEqual(["t2", "t1", "t3"]);
});

test("dropping a card where it already is is a no-op (no placeholder)", () => {
  const b = board();
  expect(resolveDrop(b, task("t2"), { type: "card", cardId: "t1", listId: "T", edge: "bottom" })).toBeNull();
  expect(resolveDrop(b, task("t3"), { type: "list-body", listId: "T" })).toBeNull();
});

test("move across lists: above a card, and into an empty list body", () => {
  const b = board();
  expect(resolveDrop(b, task("t3"), { type: "card", cardId: "a2", listId: "A", edge: "top" }))
    .toEqual({ type: "card", listId: "A", index: 1 });
  const r = resolveDrop(b, task("t1"), { type: "list-body", listId: "D" });
  expect(r).toEqual({ type: "card", listId: "D", index: 0 });
  const after = moveCard(b, "t1", "D", 0);
  expect(order(after, "D")).toEqual(["t1"]);
  expect(order(after, "T")).toEqual(["t2", "t3"]);
});

test("reorder lists left/right", () => {
  const b = board();
  const r = resolveDrop(b, { type: "list", listId: "A" }, { type: "list", listId: "D", edge: "right" });
  expect(r).toEqual({ type: "list", index: 2 });
  expect(moveList(b, "A", 2).lists.map((l) => l.id)).toEqual(["T", "D", "A"]);
  expect(resolveDrop(b, { type: "list", listId: "T" }, { type: "list", listId: "A", edge: "right" })).toBeNull(); // already there
});

test("list header drops at the top; hovering the placeholder keeps the current slot", () => {
  const b = board();
  expect(resolveDrop(b, task("t3"), { type: "list-top", listId: "T" })).toEqual({ type: "card", listId: "T", index: 0 });
  expect(resolveDrop(b, task("t1"), { type: "list-top", listId: "T" })).toBeNull(); // already first
  const current = { type: "card" as const, listId: "D", index: 0 };
  expect(resolveDrop(b, task("t1"), { type: "placeholder" }, current)).toBe(current);
});

test("withPlaceholder slots the placeholder among the non-dragged items", () => {
  const id = (x: string) => x;
  expect(withPlaceholder(["a", "b", "c"], id, undefined, -1)).toEqual(["a", "b", "c"]);
  expect(withPlaceholder(["a", "b", "c"], id, "x", 0)).toEqual([PLACEHOLDER, "a", "b", "c"]);
  expect(withPlaceholder(["a", "b", "c"], id, "x", 3)).toEqual(["a", "b", "c", PLACEHOLDER]);
  // dragging "a" within the same list: index 1 means "after b" (a is skipped when counting)
  expect(withPlaceholder(["a", "b", "c"], id, "a", 1)).toEqual(["a", "b", PLACEHOLDER, "c"]);
});
