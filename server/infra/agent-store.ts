// Agents belong to a board: their definitions live in <tenant>/agents/<board>/ and their chats in
// <tenant>/conversations/<board>/<agent>/. Before that, an account's agents were shared by all its boards
// (agents/<name>.json, conversations/<agent>/<id>.json); moveAgentsToBoards moves that layout over once.
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmdirSync, rmSync, statSync } from "node:fs";
import { MAIN_BOARD } from "../core/board";
import { boardOfCard, hasBoard } from "./board-store";
import { dataDir } from "./tenant";
import { LEO, type AgentDef } from "../../shared/types";
import { currentBoard } from "./sandbox";

const agentsDir = () => dataDir(`agents/${currentBoard()}`); // the current board's agents
const agentFile = (name: string) => `${agentsDir()}/${name}.json`;

/** The current board's saved agents, by file. */
export const hasAgentFile = (name: string) => existsSync(agentFile(name));
export const readAgentFile = (name: string): AgentDef => JSON.parse(readFileSync(agentFile(name), "utf8"));
export const agentNames = () => readdirSync(agentsDir()).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5));
export const writeAgentFile = (def: AgentDef) => Bun.write(agentFile(def.name), JSON.stringify(def, null, 2));
export const removeAgentFile = (name: string) => rmSync(agentFile(name), { force: true });

/**
 * Move the current account's shared agents onto boards. Every agent goes to the main board; a chat goes to the
 * board it belongs to (a card's to the card's board, Leo's to its board), and an agent that has chats on another
 * board gets a copy of its definition there, so those cards keep working. Files are moved, never deleted.
 */
export function moveAgentsToBoards() {
  const agents = dataDir("agents"), chats = dataDir("conversations");
  const legacyAgents = readdirSync(agents).filter((f) => f.endsWith(".json"));
  // A legacy chat folder holds .json files; a board's folder holds agent folders.
  const legacyChats = readdirSync(chats).filter((d) => statSync(`${chats}/${d}`).isDirectory() && readdirSync(`${chats}/${d}`).some((f) => f.endsWith(".json")));
  if (!legacyAgents.length && !legacyChats.length) return;

  mkdirSync(`${agents}/${MAIN_BOARD}`, { recursive: true });
  for (const f of legacyAgents) renameSync(`${agents}/${f}`, `${agents}/${MAIN_BOARD}/${f}`);

  for (const agent of legacyChats) {
    for (const f of readdirSync(`${chats}/${agent}`).filter((x) => x.endsWith(".json"))) {
      const board = boardOfChat(f.slice(0, -5));
      mkdirSync(`${chats}/${board}/${agent}`, { recursive: true });
      renameSync(`${chats}/${agent}/${f}`, `${chats}/${board}/${agent}/${f}`);
      const def = `${agents}/${board}/${agent}.json`, main = `${agents}/${MAIN_BOARD}/${agent}.json`;
      if (agent !== LEO && board !== MAIN_BOARD && !existsSync(def) && existsSync(main)) {
        mkdirSync(`${agents}/${board}`, { recursive: true });
        copyFileSync(main, def);
      }
    }
    if (!readdirSync(`${chats}/${agent}`).length) rmdirSync(`${chats}/${agent}`); // only once it's empty
  }
}

/** A card's chat (task-<card>) belongs to the card's board, Leo's (leo-<board>) to its board, any other to the main one. */
function boardOfChat(id: string) {
  if (id.startsWith("task-")) return boardOfCard(id.slice(5)) || MAIN_BOARD;
  if (id.startsWith("leo-") && hasBoard(id.slice(4))) return id.slice(4);
  return MAIN_BOARD;
}

/** A deleted board's agents and their chats go with it. */
export function forgetBoardAgents(board: string) {
  for (const dir of ["agents", "conversations"]) rmSync(`${dataDir(dir)}/${board}`, { recursive: true, force: true });
}
