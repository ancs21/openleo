// Board rules as plain functions on a Board. Cards are tasks an agent runs; the server owns task status and results.
// Storage is in infra/board-store.ts; the load/change/save use cases are in app/boards.ts.
import type { Board, Card, List } from "../../shared/types";
import { nextRun, parseSchedule } from "../../shared/schedule";
import { ICONS } from "../../shared/icons";
import { githubSource } from "./github";
import { cleanValue, fieldId, inferType, MAX_FIELDS, parseFields, parseValues, type FieldType } from "../../shared/fields";

export const MAIN_BOARD = "main";
export const BOARD_ID = /^[a-z0-9][a-z0-9-]{0,30}$/;
export const newId = () => crypto.randomUUID().slice(0, 8);
/** A card's notes: room for a long brief or a pasted document. */
const MAX_NOTES = 50_000;
const AGENT_NAME = /^[a-z0-9][a-z0-9-]{0,39}$/;
const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

/** The app saved a copy of the board older than the one the server has. */
export class StaleBoard extends Error {}

export const boardTitle = (title: string) => title.trim().slice(0, 60) || "Untitled board";

export const boardSlug = (title: string) => title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 20) || "board";

export function freshBoard(title: string, computer: string): Board {
  return { title, computer, lists: [{ id: newId(), title: "Todo", cards: [] }, { id: newId(), title: "Done", cards: [] }], cards: {}, nextNum: 1 };
}

/** A new user's first board: a "Start here" list of short how-tos, next to Todo and Done. */
const WELCOME: [string, string][] = [
  ["Ask Leo to set up this board", "Click **Ask Leo** and say what you want done, like \"Check my competitors' sites every Monday\". Leo adds the lists, agents and cards."],
  ["A card is a task", "Write what you want done, open the card and press **+** to pick an agent. Its answer shows on the card."],
  ["Let a list start its own cards", "Open a list's menu and choose **Automation…**. Every new card in that list goes to the agent you pick."],
  ["Repeat a card", "Open a card and set **Repeat**, like every morning at 9. Good for reports and checks."],
  ["Agents work in this board's computer", "They browse, run code and save files there. Click **Computer** to watch."],
  ["Pull work in from GitHub", "In an empty list's menu, choose **GitHub items…** to show pull requests, issues or a project. Drag one onto a list to make it a card."],
];
export function welcome(b: Board): Board {
  const start: List = { id: newId(), title: "Start here", cards: [] };
  for (const [title, notes] of WELCOME) {
    const cid = `t${newId()}`;
    b.cards[cid] = { id: cid, num: b.nextNum++, kind: "task", title, notes, status: "todo", source: "welcome" };
    start.cards.push(cid);
  }
  b.lists.unshift(start);
  return b;
}

/** Old boards mirrored each agent as a card in an "Agents" list: drop those, and the list once it's empty. */
export function dropAgentCards(b: Board) {
  const agentCards = new Set(Object.values(b.cards).flatMap((c) => ((c as { kind: string }).kind === "agent" ? [c.id] : [])));
  if (!agentCards.size) return;
  for (const cid of agentCards) delete b.cards[cid];
  for (const l of b.lists) l.cards = l.cards.filter((cid) => !agentCards.has(cid));
  b.lists = b.lists.filter((l) => l.title !== "Agents" || l.cards.length);
}

/** A board as read back after a restart: old agent cards dropped, and runs that were cut off marked as such. */
export function afterRestart(b: Board): Board {
  dropAgentCards(b);
  for (const c of Object.values(b.cards)) if (c.status === "running") Object.assign(c, { status: "error", result: "Interrupted: the server restarted during this run." });
  return { ...b, title: b.title || "Main" };
}

/** A change made on the server (Leo, a chat setup) bumps the revision, so an app holding an older copy reloads instead of overwriting it. */
export const bumpRev = (board: Board) => { board.rev = (board.rev ?? 0) + 1; };

/** A card's schedule from the client. The next run is server-owned: kept while unchanged, recomputed on change, none when paused (which resets failures). */
function scheduleOf(raw: any, prev: Card | undefined): Pick<Card, "schedule" | "nextRunAt" | "failStreak"> {
  const schedule = parseSchedule(raw.schedule);
  if (!schedule || !AGENT_NAME.test(schedule.agent)) return {};
  if (schedule.paused) return { schedule, failStreak: 0 };
  const same = JSON.stringify(prev?.schedule) === JSON.stringify(schedule) && prev?.nextRunAt;
  return { schedule, nextRunAt: same ? prev.nextRunAt : nextRun(schedule, Date.now()) };
}

/** The board after the app's layout and text edits, keeping server-owned task fields. `elsewhere(cid)`: the card is on another board.
 * Custom fields and their values change only through setFields/setCardValue. */
export function fromClient(board: Board, input: any, elsewhere: (cid: string) => boolean): Board {
  if (!input || !Array.isArray(input.lists) || typeof input.cards !== "object") throw new Error("bad board");
  if (typeof input.rev === "number" && input.rev !== (board.rev ?? 0)) throw new StaleBoard("the board changed meanwhile, reload it");
  let nextNum = board.nextNum;
  const cards: Record<string, Card> = {};
  for (const [cid, raw] of Object.entries<any>(input.cards)) {
    if (!/^[\w-]{1,40}$/.test(cid) || raw?.kind !== "task" || elsewhere(cid)) continue;
    const prev = board.cards[cid];
    const keep = prev?.kind === "task"
      ? { status: prev.status, result: prev.result, agent: prev.agent, agents: prev.agents, ranAt: prev.ranAt, runs: prev.runs, failStreak: prev.failStreak, values: prev.values, ...(prev.source ? { source: prev.source } : {}) }
      : { status: "todo" as const };
    cards[cid] = { id: cid, num: prev?.num ?? nextNum++, kind: "task", title: str(raw.title, 300) || "Untitled task", notes: str(raw.notes, MAX_NOTES), ...keep, ...scheduleOf(raw, prev) };
  }
  const lists: List[] = input.lists.slice(0, 50).map((l: any) => ({
    id: /^[\w-]{1,40}$/.test(l?.id) ? l.id : newId(),
    title: str(l?.title, 80) || "Untitled",
    ...(typeof l?.agent === "string" && AGENT_NAME.test(l.agent) ? { agent: l.agent } : {}),
    ...(typeof l?.icon === "string" && Object.hasOwn(ICONS, l.icon) ? { icon: l.icon } : {}),
    ...(githubSource(l?.source) ? { source: githubSource(l.source) } : {}),
    cards: (Array.isArray(l?.cards) ? l.cards : []).filter((c: unknown) => typeof c === "string" && cards[c]),
  }));
  return { title: board.title, computer: board.computer, lists, cards, nextNum: Math.max(nextNum, Number(input.nextNum) || 0), fields: board.fields, rev: (board.rev ?? 0) + 1 };
}

function task(board: Board, cid: string) {
  const card = board.cards[cid];
  if (card?.kind !== "task") throw new Error("no such task");
  return card;
}

export function updateTask(board: Board, cid: string, patch: Partial<Card>) {
  board.cards[cid] = { ...task(board, cid), ...patch };
  return board.cards[cid];
}

/** An agent sets card fields by name: unknown names become new fields typed from the value, new select choices are added, "" clears. */
export function setCardFields(board: Board, cid: string, byName: Record<string, string>) {
  const card = task(board, cid);
  const fields = (board.fields ??= []);
  const values = { ...card.values };
  const report: string[] = [];
  for (const [rawName, raw] of Object.entries(byName)) {
    const name = rawName.trim().slice(0, 40);
    if (!name) continue;
    let field = fields.find((f) => f.name.toLowerCase() === name.toLowerCase());
    if (!field) {
      if (!String(raw).trim()) continue;
      if (fields.length >= MAX_FIELDS) { report.push(`${name}: not added, the board has ${MAX_FIELDS} fields already`); continue; }
      field = { id: fieldId(name, fields), name, type: inferType(String(raw)) };
      fields.push(field);
    }
    if (field.type === "select" && String(raw).trim() && cleanValue(field, raw) === undefined && (field.options?.length ?? 0) < 30) field.options = [...(field.options ?? []), String(raw).trim().slice(0, 40)];
    const v = cleanValue(field, raw);
    if (v === undefined) { report.push(`${field.name}: "${raw}" isn't a valid ${field.type}`); continue; }
    if (v) values[field.id] = v; else delete values[field.id];
    report.push(v ? `${field.name} = ${v}` : `${field.name} cleared`);
  }
  board.cards[cid] = { ...card, values: Object.keys(values).length ? values : undefined };
  return report;
}

/** Replace a board's fields (people edit them in the card panel); values of removed fields, or that no longer fit, are dropped. */
export function setFields(board: Board, input: unknown) {
  board.fields = parseFields(input);
  for (const c of Object.values(board.cards)) {
    const values = parseValues(c.values, board.fields);
    if (values) c.values = values; else delete c.values;
  }
}

export function setCardValue(board: Board, cid: string, fieldIdIn: string, raw: unknown) {
  const card = board.cards[cid];
  const field = board.fields?.find((f) => f.id === fieldIdIn);
  if (card?.kind !== "task" || !field) throw new Error("no such card or field");
  const v = cleanValue(field, raw);
  if (v === undefined) throw new Error(`that isn't a valid ${field.type}`);
  const values = { ...card.values };
  if (v) values[field.id] = v; else delete values[field.id];
  card.values = Object.keys(values).length ? values : undefined;
}

export function addToBoard(board: Board, setup: { lists: string[]; fields: { name: string; type: FieldType; options?: string[] }[] }) {
  const has = (names: string[], n: string) => names.some((x) => x.toLowerCase() === n.trim().toLowerCase());
  const lists = setup.lists.map((t) => t.trim().slice(0, 80)).filter((t) => t && !has(board.lists.map((l) => l.title), t)).slice(0, 50 - board.lists.length);
  board.lists.push(...lists.map((title) => ({ id: newId(), title, cards: [] })));
  const fields = [...(board.fields ?? [])];
  const added: string[] = [];
  for (const f of setup.fields) {
    if (fields.length >= MAX_FIELDS || has(fields.map((x) => x.name), f.name)) continue;
    fields.push({ id: fieldId(f.name, fields), name: f.name.trim(), type: f.type, ...(f.type === "select" ? { options: f.options } : {}) });
    added.push(f.name.trim());
  }
  board.fields = parseFields(fields); // trims and caps names and options
  return { lists, fields: added };
}

export function findList(board: Board, nameOrId: string) {
  const n = nameOrId.trim().toLowerCase();
  const list = board.lists.find((l) => l.id === nameOrId || l.title.toLowerCase() === n);
  if (!list) throw new Error(`no list "${nameOrId}"; the lists are: ${board.lists.map((l) => l.title).join(", ")}`);
  return list;
}

export function findCard(board: Board, num: number) {
  const card = Object.values(board.cards).find((c) => c.num === num);
  if (!card) throw new Error(`no card #${num}`);
  return card;
}

export function addCard(board: Board, listId: string, title: string, notes = "") {
  const cid = `t${newId()}`;
  const list = findList(board, listId);
  board.cards[cid] = { id: cid, num: board.nextNum++, kind: "task", title: title.slice(0, 300) || "Untitled task", notes: notes.slice(0, MAX_NOTES), status: "todo" };
  list.cards.unshift(cid);
  return board.cards[cid]!;
}

/** Edit a card's text and/or move it to the end of another list. */
export function editCard(board: Board, cid: string, patch: { title?: string; notes?: string; listId?: string }) {
  const card = task(board, cid);
  if (patch.title?.trim()) card.title = patch.title.trim().slice(0, 300);
  if (patch.notes !== undefined) card.notes = patch.notes.slice(0, MAX_NOTES);
  if (patch.listId) {
    const to = findList(board, patch.listId);
    for (const l of board.lists) l.cards = l.cards.filter((x) => x !== cid);
    to.cards.push(cid);
  }
  return card;
}

/** Change a list by name (rename it, set the agent that starts on its new cards; agent "" = nobody), or add it when the board has none by that name. */
export function upsertList(board: Board, name: string, patch: { rename?: string; agent?: string }) {
  let list = board.lists.find((l) => l.title.toLowerCase() === name.trim().toLowerCase());
  const added = !list;
  if (!list) {
    if (board.lists.length >= 50) throw new Error("a board has at most 50 lists");
    list = { id: newId(), title: "", cards: [] };
    board.lists.push(list);
  }
  list.title = (patch.rename?.trim() || list.title || name.trim()).slice(0, 80) || "Untitled";
  if (patch.agent !== undefined) {
    if (patch.agent && !AGENT_NAME.test(patch.agent)) throw new Error(`bad agent name "${patch.agent}"`);
    if (patch.agent) list.agent = patch.agent; else delete list.agent;
  }
  return { list, added };
}
