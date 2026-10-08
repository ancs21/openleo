// Conversations on disk (<tenant>/conversations/<board>/<agent>/<id>.json), so history survives restarts and
// reloads. Agents belong to a board, so their chats do too: the current board comes from inBoard().
// Callers validate agent names and conversation ids before building paths.
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { currentBoard } from "./sandbox";
import { dataDir } from "./tenant";

const dirOf = (agent: string) => `${dataDir("conversations")}/${currentBoard()}/${agent}`;
const fileOf = (agent: string, id: string) => `${dirOf(agent)}/${id}.json`;

export function loadConversation(agent: string, id: string): unknown[] | null {
  const f = fileOf(agent, id);
  if (!existsSync(f)) return null;
  try { return JSON.parse(readFileSync(f, "utf8")); } catch { return null; }
}

export async function saveConversation(agent: string, id: string, messages: unknown[]) {
  mkdirSync(dirOf(agent), { recursive: true });
  await Bun.write(fileOf(agent, id), JSON.stringify(messages));
}

export const deleteConversations = (agent: string) => rmSync(dirOf(agent), { recursive: true, force: true });
