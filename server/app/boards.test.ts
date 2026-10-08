import { expect, test } from "bun:test";
import { addToBoard, createBoard, getBoard, MAIN_BOARD, putBoard, setCardFields, setCardValue, setFields } from "./boards";
import { dropAgentCards } from "../core/board";
import { inTenant } from "../infra/tenant";

test("old agent cards and the empty Agents list are dropped; tasks stay", () => {
  const b: any = {
    title: "Main", nextNum: 4,
    lists: [{ id: "A", title: "Agents", cards: ["a1"] }, { id: "T", title: "Todo", cards: ["t1", "a2"] }],
    cards: { a1: { id: "a1", num: 1, kind: "agent", agent: "boss" }, a2: { id: "a2", num: 2, kind: "agent", agent: "x" }, t1: { id: "t1", num: 3, kind: "task", title: "t", notes: "", status: "todo" } },
  };
  dropAgentCards(b);
  expect(b.lists).toEqual([{ id: "T", title: "Todo", cards: ["t1"] }]);
  expect(Object.keys(b.cards)).toEqual(["t1"]);
});

test("a card's schedule: next run set on save, kept while unchanged, none when paused; bad input dropped", () => {
  inTenant("sched-test", () => {
    const put = (schedule: unknown, listAgent?: string) => putBoard(MAIN_BOARD, {
      nextNum: 2, cards: { t1: { kind: "task", title: "Check the site", notes: "", schedule } },
      lists: [{ id: "L", title: "Todo", cards: ["t1"], agent: listAgent }],
    });
    const s = { agent: "operator", zone: "UTC", at: "09:00", days: [1, 2, 3, 4, 5] };
    const first = put(s, "operator").cards.t1!;
    expect(first.nextRunAt).toBeGreaterThan(Date.now());
    expect(put(s).cards.t1!.nextRunAt).toBe(first.nextRunAt!); // unchanged schedule keeps its turn
    expect(put({ ...s, paused: true }).cards.t1!.nextRunAt).toBeUndefined();
    expect(put({ ...s, minutes: 1, at: undefined }).cards.t1!.schedule).toBeUndefined(); // under the minimum
    expect(put(s, "Bad Name!").lists[0]!.agent).toBeUndefined();
  });
});

test("a list keeps a known icon; unknown names (even built-in object keys) are dropped", () => {
  inTenant("sched-test", () => {
    const icons = (...names: string[]) => putBoard(MAIN_BOARD, {
      nextNum: 1, cards: {}, lists: names.map((icon, i) => ({ id: `L${i}`, title: "x", cards: [], icon })),
    }).lists.map((l) => l.icon);
    expect(icons("check-circle", "nope", "constructor", "toString")).toEqual(["check-circle", undefined, undefined, undefined]);
  });
});

test("custom fields: agents add them by name, people set values; a board save from the app can't wipe them", () => {
  inTenant("fields-test", () => {
    putBoard(MAIN_BOARD, { nextNum: 2, cards: { t1: { kind: "task", title: "Check the site", notes: "" } }, lists: [{ id: "L", title: "Todo", cards: ["t1"] }] });
    expect(setCardFields(MAIN_BOARD, "t1", { "Status code": "200", Checked: "2026-10-07", Page: "example.com", Mood: "fine", Bad: "" }))
      .toEqual(["Status code = 200", "Checked = 2026-10-07", "Page = https://example.com", "Mood = fine"]);
    let b = putBoard(MAIN_BOARD, { nextNum: 2, cards: { t1: { kind: "task", title: "Check the site", notes: "", values: {} } }, lists: [{ id: "L", title: "Todo", cards: ["t1"] }] });
    expect(b.fields!.map((f) => `${f.name}:${f.type}`)).toEqual(["Status code:number", "Checked:date", "Page:link", "Mood:text"]);
    expect(b.cards.t1!.values!["status-code"]).toBe("200"); // kept, though the save sent none
    expect(setCardFields(MAIN_BOARD, "t1", { "status code": "fast" })).toEqual([`Status code: "fast" isn't a valid number`]);
    expect(() => setCardValue(MAIN_BOARD, "t1", "checked", "soon")).toThrow();
    b = setFields(MAIN_BOARD, b.fields!.filter((f) => f.id !== "mood"));
    expect(Object.keys(b.cards.t1!.values!)).toEqual(["status-code", "checked", "page"]);
  });
});

test("a chat setup adds only the lists and fields the board doesn't have", () => {
  inTenant("setup-test", () => {
    putBoard(MAIN_BOARD, { nextNum: 1, cards: {}, lists: [{ id: "T", title: "Todo", cards: [] }] });
    const added = addToBoard(MAIN_BOARD, { lists: ["todo", "Won"], fields: [{ name: "Deal value", type: "number" }, { name: "Stage", type: "select", options: ["A", "B"] }] });
    expect(added).toEqual({ lists: ["Won"], fields: ["Deal value", "Stage"] });
    expect(addToBoard(MAIN_BOARD, { lists: [], fields: [{ name: "deal VALUE", type: "text" }] }).fields).toEqual([]);
  });
});

test("a new user's main board starts with a Start here list of how-tos", async () => {
  await inTenant("welcome-board", async () => {
    const b = getBoard(MAIN_BOARD);
    expect(b.lists.map((l) => l.title)).toEqual(["Start here", "Todo", "Done"]);
    expect(b.lists[0]!.cards.map((cid) => b.cards[cid]!.num)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(b.nextNum).toBe(7);
    expect(b.cards[b.lists[0]!.cards[0]!]!.source).toBe("welcome"); // no status badge on these
    expect(createBoard("Other").id && getBoard("other").lists.map((l) => l.title)).toEqual(["Todo", "Done"]);
  });
});
