// Leo: the built-in assistant of each board. People chat with it to manage the board (cards, lists, fields,
// which agent works on what); it hands the real work to the board's agents. It has no computer of its own.
import { Type } from "@earendil-works/pi-ai";
import { FIELD_TYPES } from "../../shared/fields";
import { LEO, type AgentDef } from "../../shared/types";
import { addCard, addToBoard, editCard, findCard, findList, getBoard, setCardFields, upsertList } from "./boards";
import { defineTool } from "../infra/runtime";
import { leoSettings } from "../infra/leo-settings";

export { LEO } from "../../shared/types";

const INSTRUCTIONS = `You are Leo, the assistant built into this board. You manage the board for the user: add, edit and move cards,
add and rename lists, choose which agent picks up new cards in a list, add fields and fill them in, start agents on cards,
create a new agent when no agent on the board fits a job (ask what it should do first if that isn't clear),
and change an agent's description or instructions when asked (read it first, keep what the user didn't ask to change).
Read the board first when you need to know what's on it. Cards are tasks that agents work on; you don't do the tasks yourself,
you set them up and start the right agent. Refer to cards by number (#12). Keep replies short and plain; say what you changed.
You can't delete cards, lists or fields: tell the user to do that themselves.`;

/** Leo as an agent definition (it isn't stored with the user's agents). */
export const leoDef = (): AgentDef => ({ name: LEO, description: "Manages this board", ...leoSettings(), instructions: INSTRUCTIONS, subagents: [], mcp: [] });

const text = (t: string) => ({ content: [{ type: "text" as const, text: t }], details: {} });

/** Everything on the board, as text: lists, fields, cards and the agents there are. */
function describe(bid: string, agents: AgentDef[]) {
  const b = getBoard(bid);
  const fields = b.fields ?? [];
  const lines = [`Board "${b.title}"`];
  lines.push(`Agents (by ID): ${agents.map((a) => `${a.name}${a.title ? ` "${a.title}"` : ""} (${a.description || "no description"})`).join("; ") || "none yet"}`);
  lines.push(`Fields: ${fields.map((f) => `${f.name} (${f.type}${f.options ? `: ${f.options.join("/")}` : ""})`).join(", ") || "none"}`);
  for (const l of b.lists) {
    if (l.source) { lines.push(`\nList "${l.title}": shows GitHub items for "${l.source.query}" (the user adds them to other lists as cards)`); continue; }
    lines.push(`\nList "${l.title}"${l.agent ? ` (new cards go to ${l.agent})` : ""}: ${l.cards.length} card(s)`);
    for (const cid of l.cards.slice(0, 100)) {
      const c = b.cards[cid];
      if (!c) continue;
      const values = fields.filter((f) => c.values?.[f.id]).map((f) => `${f.name}=${c.values![f.id]}`).join(", ");
      lines.push(`- #${c.num} ${c.title} [${c.status}${c.agent ? `, ${c.agent}` : ""}]${values ? ` {${values}}` : ""}`);
    }
  }
  return lines.join("\n");
}

type NewAgent = { name: string; title?: string; description: string; instructions: string };
type AgentPatch = { title?: string; description?: string; instructions?: string };
/** The tools Leo uses on board `bid`. `run` starts an agent on a card; `agents` lists the board's agents; `create` saves a new one, `update` changes one. */
export function leoTools(bid: string, { run, agents, create, update }: {
  run: (cid: string, agent: string) => void; agents: () => AgentDef[];
  create: (a: NewAgent) => Promise<AgentDef>; update: (name: string, patch: AgentPatch) => Promise<AgentDef>;
}) {
  const agentNamed = (name: string) => {
    const a = agents().find((x) => x.name === name);
    if (!a) throw new Error(`no agent "${name}"; the agents are: ${agents().map((x) => x.name).join(", ") || "none"}`);
    return a.name;
  };
  return [
    defineTool({
      name: "read_board", label: "Read board",
      description: "Everything on this board: its lists (and their agents), fields, cards with status and field values, and the agents there are.",
      parameters: Type.Object({}),
      execute: async () => text(describe(bid, agents())),
    }),
    defineTool({
      name: "add_cards", label: "Add cards",
      description: "Add task cards to a list (by list name). Each card: a title, optional notes (details for the agent) and optional field values by field name.",
      parameters: Type.Object({
        list: Type.String(),
        cards: Type.Array(Type.Object({ title: Type.String(), notes: Type.Optional(Type.String()), fields: Type.Optional(Type.Record(Type.String(), Type.String())) })),
      }),
      execute: async (_id, { list, cards }) => {
        const l = findList(bid, list);
        const done = cards.slice(0, 50).map((c) => {
          const card = addCard(bid, l.id, c.title, c.notes);
          const set = c.fields ? setCardFields(bid, card.id, c.fields) : [];
          // In a list with an agent, that agent starts on it, as when a person adds it (if it can't, the card's history says why).
          if (l.agent) try { run(card.id, l.agent); } catch {}
          return `#${card.num} ${card.title}${set.length ? ` (${set.join("; ")})` : ""}`;
        });
        return text(`Added to ${l.title}${l.agent ? `, where ${l.agent} starts on them` : ""}:\n${done.join("\n")}`);
      },
    }),
    defineTool({
      name: "update_card", label: "Update card",
      description: "Change a card (by number): its title, its notes, the list it's in (moved to the end), and field values by field name (\"\" clears one; a new name adds the field).",
      parameters: Type.Object({
        card: Type.Number(), title: Type.Optional(Type.String()), notes: Type.Optional(Type.String()), list: Type.Optional(Type.String()),
        fields: Type.Optional(Type.Record(Type.String(), Type.String())),
      }),
      execute: async (_id, { card, title, notes, list, fields }) => {
        const c = findCard(bid, card);
        const to = list ? findList(bid, list) : undefined;
        editCard(bid, c.id, { title, notes, listId: to?.id });
        const set = fields ? setCardFields(bid, c.id, fields) : [];
        return text(`Updated #${c.num}${to ? `, now in ${to.title}` : ""}${set.length ? `: ${set.join("; ")}` : ""}`);
      },
    }),
    defineTool({
      name: "set_list", label: "Set up list",
      description: "Add a list, or change one (by name): rename it, or choose the agent that starts on every new card added to it (agent \"\" = nobody).",
      parameters: Type.Object({ list: Type.String({ description: "the list's name; a name the board doesn't have adds a list" }), rename: Type.Optional(Type.String()), agent: Type.Optional(Type.String()) }),
      execute: async (_id, { list, rename, agent }) => {
        const { list: l, added } = upsertList(bid, list, { rename, agent: agent ? agentNamed(agent) : agent });
        return text(`${added ? "Added" : "Updated"} list ${l.title}${l.agent ? `; new cards go to ${l.agent}` : ""}`);
      },
    }),
    defineTool({
      name: "add_fields", label: "Add fields",
      description: `Add custom fields every card has. Types: ${FIELD_TYPES.join(", ")} ("select" needs options).`,
      parameters: Type.Object({ fields: Type.Array(Type.Object({ name: Type.String(), type: Type.Union(FIELD_TYPES.map((t) => Type.Literal(t))), options: Type.Optional(Type.Array(Type.String())) })) }),
      execute: async (_id, { fields }) => {
        const added = addToBoard(bid, { lists: [], fields }).fields;
        return text(added.length ? `Added fields: ${added.join(", ")}` : "The board has those fields already.");
      },
    }),
    defineTool({
      name: "create_agent", label: "Create agent",
      description: "Create a new agent on this board for a job none of its agents does. It can search the web, read pages, save files, run commands and use the board's computer.",
      parameters: Type.Object({
        name: Type.String({ description: "its ID: short, lowercase letters, digits and dashes, e.g. lead-researcher" }),
        title: Type.Optional(Type.String({ description: "the name people see, e.g. Lead Researcher" })),
        description: Type.String({ description: "one sentence: what it does" }),
        instructions: Type.String({ description: "its instructions, in second person: what to do, in what order, what to avoid, what the result looks like" }),
      }),
      execute: async (_id, a) => {
        const def = await create(a);
        return text(`Created agent ${def.name}. The user can change it under Manage agents.`);
      },
    }),
    defineTool({
      name: "read_agent", label: "Read agent",
      description: "An agent's description and full instructions, before changing them.",
      parameters: Type.Object({ agent: Type.String() }),
      execute: async (_id, { agent }) => {
        const a = agents().find((x) => x.name === agentNamed(agent))!;
        return text(`Agent ${a.name}${a.title ? ` "${a.title}"` : ""}\nDescription: ${a.description || "(none)"}\nInstructions:\n${a.instructions || "(none)"}`);
      },
    }),
    defineTool({
      name: "update_agent", label: "Update agent",
      description: "Change an agent's shown name (title), description and/or instructions. Send the whole new text of what changes (read_agent first); leave out what stays. Its ID never changes.",
      parameters: Type.Object({ agent: Type.String(), title: Type.Optional(Type.String()), description: Type.Optional(Type.String()), instructions: Type.Optional(Type.String()) }),
      execute: async (_id, { agent, title, description, instructions }) => {
        const name = agentNamed(agent);
        const patch = { ...(title !== undefined ? { title } : {}), ...(description !== undefined ? { description } : {}), ...(instructions !== undefined ? { instructions } : {}) };
        if (!Object.keys(patch).length) throw new Error("nothing to change: send a new description or instructions");
        await update(name, patch);
        return text(`Updated agent ${name}: its ${Object.keys(patch).join(" and ")}.`);
      },
    }),
    defineTool({
      name: "start_agent", label: "Start agent",
      description: "Start an agent working on a card (by number). It runs in the background; the card shows its progress and result.",
      parameters: Type.Object({ card: Type.Number(), agent: Type.String() }),
      execute: async (_id, { card, agent }) => {
        const c = findCard(bid, card);
        const name = agentNamed(agent);
        run(c.id, name);
        return text(`${name} started on #${c.num} ${c.title}`);
      },
    }),
  ];
}
