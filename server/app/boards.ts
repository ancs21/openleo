// Board use cases: each loads a board, applies a rule from core/board.ts and saves it (infra/board-store.ts).
// Changes made on the server (Leo, a chat setup) bump the board's revision, so an app holding an older copy reloads.
import type { Card } from "../../shared/types";
import type { FieldType } from "../../shared/fields";
import * as rules from "../core/board";
import { boardOfCard, getBoard, hasBoard, newBoard, removeBoard, saveBoard, setBoard } from "../infra/board-store";

export { BOARD_ID, MAIN_BOARD, StaleBoard } from "../core/board";
export { boardOfCard, computerOf, getBoard, hasBoard, listBoards } from "../infra/board-store";

/** Save a board after a server-side change, with a new revision. */
function changed(bid: string) {
  rules.bumpRev(getBoard(bid));
  saveBoard(bid);
}

export function createBoard(title: string) {
  const name = rules.boardTitle(title);
  const slug = rules.boardSlug(name);
  let bid = slug === rules.MAIN_BOARD ? `${slug}-${rules.newId().slice(0, 4)}` : slug;
  while (hasBoard(bid)) bid = `${slug}-${rules.newId().slice(0, 4)}`;
  setBoard(bid, newBoard(name, bid));
  return { id: bid, title: name };
}

export function renameBoard(bid: string, title: string) {
  getBoard(bid).title = rules.boardTitle(title);
  saveBoard(bid);
}

export function deleteBoard(bid: string) {
  if (bid === rules.MAIN_BOARD) throw new Error("the main board can't be deleted");
  getBoard(bid);
  removeBoard(bid);
}

/** Accept layout and text edits from the app (see rules.fromClient). */
export function putBoard(bid: string, input: any) {
  return setBoard(bid, rules.fromClient(getBoard(bid), input, (cid) => { const owner = boardOfCard(cid); return !!owner && owner !== bid; }));
}

export function updateTask(bid: string, cid: string, patch: Partial<Card>) {
  const card = rules.updateTask(getBoard(bid), cid, patch);
  saveBoard(bid);
  return card;
}

export function setCardFields(bid: string, cid: string, byName: Record<string, string>) {
  const report = rules.setCardFields(getBoard(bid), cid, byName);
  saveBoard(bid);
  return report;
}

export function setFields(bid: string, input: unknown) {
  rules.setFields(getBoard(bid), input);
  saveBoard(bid);
  return getBoard(bid);
}

export function setCardValue(bid: string, cid: string, fieldId: string, raw: unknown) {
  rules.setCardValue(getBoard(bid), cid, fieldId, raw);
  saveBoard(bid);
  return getBoard(bid);
}

export function addToBoard(bid: string, setup: { lists: string[]; fields: { name: string; type: FieldType; options?: string[] }[] }) {
  const added = rules.addToBoard(getBoard(bid), setup);
  changed(bid);
  return added;
}

export const findList = (bid: string, nameOrId: string) => rules.findList(getBoard(bid), nameOrId);
export const findCard = (bid: string, num: number) => rules.findCard(getBoard(bid), num);

export function addCard(bid: string, listId: string, title: string, notes = "") {
  const card = rules.addCard(getBoard(bid), listId, title, notes);
  changed(bid);
  return card;
}

export function editCard(bid: string, cid: string, patch: { title?: string; notes?: string; listId?: string }) {
  const card = rules.editCard(getBoard(bid), cid, patch);
  changed(bid);
  return card;
}

export function upsertList(bid: string, name: string, patch: { rename?: string; agent?: string }) {
  const result = rules.upsertList(getBoard(bid), name, patch);
  changed(bid);
  return result;
}
