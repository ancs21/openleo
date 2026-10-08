import { expect, test } from "bun:test";
import { createBoard, getBoard, putBoard, StaleBoard } from "./boards";
import { leoTools } from "./leo";
import { inTenant } from "../infra/tenant";

test("Leo manages the board; a save from an older copy of it is refused", async () => {
  await inTenant("leo-test", async () => {
    const bid = createBoard("Leo").id;
    putBoard(bid, { nextNum: 1, cards: {}, lists: [{ id: "T", title: "Todo", cards: [] }] });
    const started: string[] = [];
    const updated: object[] = [];
    const tools = Object.fromEntries(leoTools(bid, {
      run: (cid, agent) => void started.push(`${agent}:${cid}`),
      agents: () => [{ name: "researcher", description: "", model: "x/y", instructions: "", subagents: [], mcp: [] }],
      create: async (a) => ({ ...a, model: "x/y", subagents: [], mcp: [] }),
      update: async (name, patch) => (updated.push({ name, ...patch }), { name, description: "", model: "x/y", instructions: "", subagents: [], mcp: [], ...patch }),
    }).map((t) => [t.name, t]));
    const call = async (name: string, args: object) => ((await tools[name]!.execute("id", args as any)) as any).content[0].text as string;

    const seen = getBoard(bid).rev;
    expect(await call("set_list", { list: "Research", agent: "researcher" })).toBe("Added list Research; new cards go to researcher");
    expect(await call("add_cards", { list: "research", cards: [{ title: "Compare prices", fields: { Budget: "500" } }] })).toContain("#1 Compare prices (Budget = 500)");
    expect(started).toHaveLength(1); // the list's agent started on the new card
    expect(await call("update_card", { card: 1, list: "Todo", title: "Compare prices again" })).toBe("Updated #1, now in Todo");
    await expect(call("start_agent", { card: 1, agent: "nobody" })).rejects.toThrow(/no agent "nobody"/);
    expect(await call("create_agent", { name: "writer", description: "Writes posts", instructions: "Write." })).toBe("Created agent writer. The user can change it under Manage agents.");
    expect(await call("read_agent", { agent: "researcher" })).toContain("Instructions:");
    expect(await call("update_agent", { agent: "researcher", instructions: "Track BTC and ETH." })).toBe("Updated agent researcher: its instructions.");
    expect(updated).toEqual([{ name: "researcher", instructions: "Track BTC and ETH." }]);
    await expect(call("update_agent", { agent: "researcher" })).rejects.toThrow(/nothing to change/);
    expect(await call("read_board", {})).toContain("#1 Compare prices again [todo] {Budget=500}");

    // The app still holds the board from before Leo's changes: its save is refused, not applied.
    expect(() => putBoard(bid, { rev: seen, nextNum: 1, cards: {}, lists: [{ id: "T", title: "Todo", cards: [] }] })).toThrow(StaleBoard);
    expect(getBoard(bid).lists.map((l) => l.title)).toEqual(["Todo", "Research"]);
  });
});
