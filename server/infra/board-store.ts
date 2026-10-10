// Boards are kept in <tenant>/boards/<id>.json, read once per account and written back after each change.
import { existsSync, readFileSync, readdirSync, renameSync, rmSync } from "node:fs";
import type { Board, BoardInfo } from "../../shared/types";
import { afterRestart, freshBoard, MAIN_BOARD, welcome } from "../core/board";
import { currentTenant, dataDir } from "./tenant";

const file = (bid: string) => `${dataDir("boards")}/${bid}.json`;
const SANDBOX_NAME = "openleo"; // computers are named openleo-<account>-<board>

export const newBoard = (title: string, bid: string) => freshBoard(title, `${SANDBOX_NAME}-${currentTenant().slice(0, 8)}-${bid}`);

const byTenant = new Map<string, Map<string, Board>>();
function boards() {
  const tenant = currentTenant();
  let map = byTenant.get(tenant);
  if (map) return map;
  map = new Map();
  byTenant.set(tenant, map);
  const legacy = `${dataDir()}/board.json`; // single-board layout -> "main"
  if (existsSync(legacy) && !existsSync(file(MAIN_BOARD))) renameSync(legacy, file(MAIN_BOARD));
  for (const f of readdirSync(dataDir("boards")).filter((f) => f.endsWith(".json"))) {
    map.set(f.slice(0, -5), afterRestart(JSON.parse(readFileSync(`${dataDir("boards")}/${f}`, "utf8"))));
  }
  if (!map.has(MAIN_BOARD)) { map.set(MAIN_BOARD, welcome(newBoard("Main", MAIN_BOARD))); saveBoard(MAIN_BOARD); }
  return map;
}

let saving = Promise.resolve();
export function saveBoard(bid: string) {
  const path = file(bid), board = boards().get(bid); // resolved now: the write may run after this request's context ends
  if (board) saving = saving.then(() => Bun.write(path, JSON.stringify(board, null, 2)).then(() => {}));
}

export function setBoard(bid: string, board: Board) {
  boards().set(bid, board);
  saveBoard(bid);
  return board;
}

export function getBoard(bid: string) {
  const b = boards().get(bid);
  if (!b) throw new Error(`no board "${bid}"`);
  return b;
}

export const hasBoard = (bid: string) => boards().has(bid);

export const listBoards = (): BoardInfo[] =>
  [...boards()].map(([bid, b]) => ({ id: bid, title: b.title })).sort((a, b) => (a.id === MAIN_BOARD ? -1 : b.id === MAIN_BOARD ? 1 : a.title.localeCompare(b.title)));

export function removeBoard(bid: string) {
  boards().delete(bid);
  rmSync(file(bid), { force: true });
}

/** Card ids are unique across boards. */
export function boardOfCard(cid: string) {
  for (const [bid, b] of boards()) if (b.cards[cid]) return bid;
  return undefined;
}

/** Boards from before tenants keep their original computer names (and files). */
export const computerOf = (bid: string) => getBoard(bid).computer ?? (bid === MAIN_BOARD ? SANDBOX_NAME : `${SANDBOX_NAME}-${bid}`);
