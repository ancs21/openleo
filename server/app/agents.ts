// A board's agents: their definitions (saved by infra/agent-store.ts), checked, drafted from a plain-language
// description, created and changed. Leo and the memory keeper are built in and never saved with them.
import { EFFORTS, LEO, MEMORY_KEEPER, type AgentDef } from "../../shared/types";
import { agentNames, hasAgentFile, readAgentFile, removeAgentFile, writeAgentFile } from "../infra/agent-store";
import { deleteConversations } from "../infra/conversations";
import { leoSettings } from "../infra/leo-settings";
import { MCP_NAME } from "../infra/mcp";
import { createAgent, lastText, useModel } from "../infra/runtime";
import { leoDef } from "./leo";
import { dropSessions, retune } from "./live-agents";
import { memoryKeeperDef } from "./notes";
import { pickIcon } from "./pick-icon";
import { agentSkills } from "./skills";

export const NAME = /^[a-z0-9][a-z0-9-]{0,40}$/;

export function loadDef(name: string): AgentDef {
  if (name === LEO) return leoDef();
  if (name === MEMORY_KEEPER) return memoryKeeperDef();
  if (!NAME.test(name) || !hasAgentFile(name)) throw new Error(`no agent "${name}"`);
  return readAgentFile(name);
}

export const listDefs = () => agentNames().map(loadDef);

export function validate(body: any, name: string): AgentDef {
  const strs = (v: any) => (Array.isArray(v) ? v.filter((x) => typeof x === "string") : []);
  if (!NAME.test(name)) throw new Error("name must be lowercase letters, digits, dashes");
  if (["new", "draft", LEO, MEMORY_KEEPER].includes(name)) throw new Error(`"${name}" is reserved`);
  if (typeof body?.model !== "string" || !body.model.includes("/")) throw new Error("model must be provider/model-id");
  return {
    name,
    description: String(body.description ?? ""),
    ...(typeof body.title === "string" && body.title.trim() ? { title: body.title.trim().slice(0, 60) } : {}),
    ...(typeof body.icon === "string" && /^[a-z][a-z-]{0,30}$/.test(body.icon) ? { icon: body.icon } : {}),
    model: body.model,
    instructions: String(body.instructions ?? ""),
    subagents: strs(body.subagents).filter((s) => NAME.test(s) && s !== name),
    skills: agentSkills(body.skills),
    mcp: strs(body.mcp).filter((s) => MCP_NAME.test(s)),
    ...(EFFORTS.includes(body.effort) ? { effort: body.effort } : {}),
    ...(body.compact === false ? { compact: false } : {}),
  };
}

/** Turn a plain-language description into an agent definition. The draft is returned, not saved. */
export async function draftDef(description: string, model: string): Promise<AgentDef> {
  const agent = createAgent(() => {
    useModel(model);
    return `You design AI agents. Reply with one JSON object and nothing else:
{"title": "Short Name In Plain Words", "name": "lowercase-dashed-name", "description": "one sentence", "instructions": "system prompt"}
Write the instructions in second person, specific to the job: what to do, in what order, what to avoid, and what the final answer looks like.
The agent can search the web, read web pages, read and save files, run commands, and use a computer.`;
  });
  await agent.prompt(description);
  const text = lastText(agent);
  const raw = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  if (!raw) throw new Error("the model didn't return an agent draft, try again");
  const body = JSON.parse(raw);
  const name = String(body.name ?? "").toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "agent";
  return validate({ ...body, model, subagents: [] }, ["new", "draft"].includes(name) ? `${name}-agent` : name);
}

/** Save a new agent on the current board (Leo's create_agent). It gets the model of the board's newest agent, else Leo's. */
export async function createDef(body: { name: string; title?: string; description: string; instructions: string }) {
  if (hasAgentFile(body.name)) throw new Error(`there's already an agent "${body.name}" on this board`);
  const def = validate({ ...body, model: listDefs().at(-1)?.model ?? leoSettings().model }, body.name);
  def.icon = await pickIcon(`${def.name}: ${def.description}`).catch(() => undefined);
  await writeAgentFile(def);
  return def;
}

/** Change a saved agent's description or instructions (Leo's update_agent); its open chats restart with them. */
export async function updateDef(name: string, patch: { title?: string; description?: string; instructions?: string }) {
  const def = validate({ ...loadDef(name), ...patch }, name);
  await writeAgentFile(def);
  dropSessions(def.name);
  return def;
}

/** Save an agent from the app. A change of model or thinking time only (the chat's picker) keeps its conversations going. */
export async function saveDef(body: unknown, name: string) {
  const def = validate(body, name);
  const prev = hasAgentFile(def.name) ? loadDef(def.name) : null;
  if (!prev && !def.icon) def.icon = await pickIcon(`${def.name}: ${def.description}`).catch((e) => void console.warn("icon pick failed:", e.message)); // a new agent without a chosen icon
  await writeAgentFile(def);
  const rest = (d: AgentDef) => JSON.stringify({ ...d, model: undefined, effort: undefined });
  if (prev && rest(prev) === rest(def)) retune(def.name, def.model, def.effort);
  else dropSessions(def.name);
  return def;
}

/** Delete an agent with its chats. */
export function deleteDef(name: string) {
  if (!NAME.test(name)) throw new Error("bad name");
  removeAgentFile(name);
  dropSessions(name);
  deleteConversations(name);
}
