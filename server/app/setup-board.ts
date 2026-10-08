// Set a board up from a sentence ("a sales pipeline"): the fast model suggests lists and fields, which are added.
import { FIELD_TYPES, type FieldType } from "../../shared/fields";
import type { Board } from "../../shared/types";
import { askFast } from "../infra/fast";

const PROMPT = `You set up a kanban board where AI agents work on the cards. From the user's request, suggest the lists (columns)
and the fields (typed values on every card) the board should have. Only suggest what is missing from the board as it is.
Field types: ${FIELD_TYPES.join(", ")} ("select" needs "options"). Keep names short, in the user's language.
Reply with one JSON object and nothing else: {"lists": ["List name"], "fields": [{"name": "Priority", "type": "select", "options": ["High", "Low"]}]}`;

export type Setup = { lists: string[]; fields: { name: string; type: FieldType; options?: string[] }[] };

export async function draftSetup(request: string, board: Board): Promise<Setup> {
  const now = `The board now: lists ${JSON.stringify(board.lists.map((l) => l.title))}; fields ${JSON.stringify((board.fields ?? []).map((f) => f.name))}.`;
  const text = await askFast(PROMPT, `${now}\n\nRequest: ${request.slice(0, 2000)}`);
  if (text === undefined) throw new Error("sign in with ChatGPT to set boards up by chatting");
  const raw = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  if (!raw) throw new Error("couldn't work out a setup from that, try saying it another way");
  const body = JSON.parse(raw);
  return {
    lists: (Array.isArray(body.lists) ? body.lists : []).filter((l: unknown) => typeof l === "string" && l.trim()),
    fields: (Array.isArray(body.fields) ? body.fields : []).filter((f: any) => typeof f?.name === "string" && FIELD_TYPES.includes(f.type)),
  };
}
