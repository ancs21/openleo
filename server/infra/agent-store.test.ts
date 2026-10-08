import { expect, test } from "bun:test";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { addCard, createBoard, getBoard, MAIN_BOARD } from "../app/boards";
import { loadConversation, saveConversation } from "./conversations";
import { moveAgentsToBoards } from "./agent-store";
import { inBoard } from "./sandbox";
import { dataDir, inTenant } from "./tenant";

test("a chat belongs to its board: the same agent name on two boards keeps two histories", async () => {
  await inTenant("boards-chat-test", async () => {
    await inBoard("a", () => saveConversation("writer", "c1", [{ role: "user", content: "on board a" }]));
    expect(inBoard("b", () => loadConversation("writer", "c1"))).toBeNull();
    expect(inBoard("a", () => loadConversation("writer", "c1"))).toEqual([{ role: "user", content: "on board a" }]);
  });
});

test("agents from before boards had their own move onto boards: nothing is lost, and it happens once", () => {
  inTenant("boards-move-test", () => {
    getBoard(MAIN_BOARD); // the main board exists
    const sale = createBoard("Sale").id;
    const card = addCard(sale, getBoard(sale).lists[0]!.id, "Find leads");
    const agents = dataDir("agents"), chats = dataDir("conversations");
    writeFileSync(`${agents}/boss.json`, JSON.stringify({ name: "boss", description: "", model: "x/y", instructions: "Lead.", subagents: [] }));
    writeFileSync(`${agents}/writer.json`, JSON.stringify({ name: "writer", description: "", model: "x/y", instructions: "Write.", subagents: [] }));
    for (const [agent, id] of [["boss", `task-${card.id}`], ["writer", "abc"], ["leo", `leo-${sale}`]] as const) {
      mkdirSync(`${chats}/${agent}`, { recursive: true });
      writeFileSync(`${chats}/${agent}/${id}.json`, JSON.stringify([{ role: "user", content: id }]));
    }

    moveAgentsToBoards();

    expect(readdirSync(agents).sort()).toEqual([MAIN_BOARD, sale].sort()); // no agent files left at the top
    expect(readdirSync(`${agents}/${MAIN_BOARD}`).sort()).toEqual(["boss.json", "writer.json"]);
    expect(existsSync(`${chats}/${sale}/boss/task-${card.id}.json`)).toBe(true); // a card's chat goes with its card
    expect(existsSync(`${agents}/${sale}/boss.json`)).toBe(true); // ... and so does the agent that worked on it
    expect(existsSync(`${chats}/${MAIN_BOARD}/writer/abc.json`)).toBe(true);
    expect(existsSync(`${chats}/${sale}/leo/leo-${sale}.json`)).toBe(true);
    expect(existsSync(`${agents}/${sale}/leo.json`)).toBe(false); // Leo is built in
    expect(readdirSync(chats).sort()).toEqual([MAIN_BOARD, sale].sort());

    moveAgentsToBoards(); // a second run changes nothing
    expect(readdirSync(`${agents}/${MAIN_BOARD}`).sort()).toEqual(["boss.json", "writer.json"]);
  });
});
