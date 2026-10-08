// Live agents, one per conversation: built from an agent's definition with its tools and context, kept in memory,
// and restored from the saved chat when they aren't. Long conversations are summarized before the next message.
import type { Agent } from "@earendil-works/pi-agent-core";
import type { Effort } from "../../shared/types";
import { loadConversation, saveConversation } from "../infra/conversations";
import { mcpToolsFor } from "../infra/mcp";
import { createAgent, resolveModel, useContext, useEffort, useModel, useSubagent, useTool, useWebSearch, type AgentFn } from "../infra/runtime";
import { computerState, currentBoard, inBoard } from "../infra/sandbox";
import { SANDBOXED } from "../infra/config";
import { currentTenant } from "../infra/tenant";
import { hasAgentFile } from "../infra/agent-store";
import { createDef, listDefs, loadDef, updateDef } from "./agents";
import { compact } from "./compact";
import { LEO, leoTools } from "./leo";
import { boardContext, rememberTool } from "./notes";
import { agentSkills, skillsPrompt, syncSkills, useSkillTool } from "./skills";
import { runTask } from "./tasks";
import { cardFieldsTool, tools } from "./tools";
import { MEMORY_KEEPER } from "../../shared/types";

/**
 * An agent from its definition, for one conversation: in a task's ("task-<card id>") it can fill in the card's fields.
 * Leo gets the tools to manage its board instead of a computer.
 */
function fromDef(name: string, conversation = ""): AgentFn {
  const cardId = conversation.startsWith("task-") ? conversation.slice(5) : undefined;
  return () => {
    const def = loadDef(name);
    useModel(def.model);
    if (name === LEO) {
      const bid = currentBoard();
      for (const t of leoTools(bid, { run: (cid, agent) => runTask(bid, cid, agent), agents: () => inBoard(bid, listDefs), create: (a) => inBoard(bid, () => createDef(a)), update: (n, patch) => inBoard(bid, () => updateDef(n, patch)) })) useTool(t);
      if (SANDBOXED) {
        // Leo reads the board's notes only while its computer is on: chatting with Leo shouldn't start it.
        useContext(async () => (computerState(currentBoard()).state === "running" ? boardContext() : ""));
        useTool(rememberTool("Leo"));
      }
      return def.instructions;
    }
    if (name === MEMORY_KEEPER) {
      // Tidying needs only files: no web, no screen, no apps, so a bad note has less to work with.
      for (const t of [tools.bash, tools.read_file, tools.write_file]) useTool(t!);
      if (SANDBOXED) useContext(boardContext);
      return def.instructions;
    }
    if (def.effort) useEffort(def.effort);
    // Every agent can use everything: tools run in its board's computer, and web search is added where the model supports it.
    useWebSearch();
    for (const t of Object.values(tools)) useTool(t);
    for (const t of mcpToolsFor(def.mcp ?? [])) useTool(t);
    if (cardId) useTool(cardFieldsTool(cardId));
    // The board's notes and memory, and this agent's skills, live in the board's computer (app/notes.ts, app/skills.ts).
    if (SANDBOXED) {
      const skills = agentSkills(def.skills); // also drops the old list of plain names
      useContext(async () => {
        // Only skills that made it into the computer are offered; a failed one is retried later (app/skills.ts).
        const ready = skills.length ? await syncSkills(name, skills).catch(() => []) : [];
        return [await boardContext(), skillsPrompt(name, skills.filter((s) => ready.includes(s.name)))].filter(Boolean).join("\n\n");
      });
      if (skills.length) useTool(useSkillTool(name, skills));
      useTool(rememberTool(name, cardId));
    }
    for (const sub of def.subagents) {
      if (sub !== name && hasAgentFile(sub)) useSubagent(sub, loadDef(sub).description, fromDef(sub));
    }
    return def.instructions;
  };
}

const sessions = new Map<string, Agent>();
/** Live-agent key: "<tenant>/<board>/<agent>:<conversation>" (agents belong to a board). */
export const skey = (name: string, conversation: string) => `${currentTenant()}/${currentBoard()}/${name}:${conversation}`;
/** This account's agents working right now (chats and board tasks). */
export const runningCount = () => [...sessions].filter(([k, a]) => k.startsWith(`${currentTenant()}/`) && a.state.isStreaming).length;
/** Conversations being summarized (not streaming, but not free either). */
export const compacting = new Set<string>();
/** How to end each running card run right away, by session key (see stopSession). */
export const taskStops = new Map<string, () => void>();

/** The live agent of a conversation, if it's in memory. */
export const liveAgent = (name: string, conversation: string) => sessions.get(skey(name, conversation));

/** A conversation is answering or being summarized, so it can't take another message yet. */
export const isBusy = (name: string, conversation: string) =>
  !!liveAgent(name, conversation)?.state.isStreaming || compacting.has(skey(name, conversation));

/** An agent's live conversations end (its definition changed, or it was deleted). */
export function dropSessions(name: string) {
  for (const [k, a] of sessions) if (k.startsWith(skey(name, ""))) (a.abort(), sessions.delete(k));
}

/** Put an agent's live conversations on another model and thinking time, keeping their messages. */
export function retune(name: string, model: string, effort?: Effort) {
  for (const [k, a] of sessions) if (k.startsWith(skey(name, ""))) Object.assign(a.state, { model: resolveModel(model), thinkingLevel: effort ?? "medium" });
}

/** The live agent for a conversation, restored from disk when it isn't in memory. */
export function getSession(name: string, conversation: string) {
  const key = skey(name, conversation);
  let agent = sessions.get(key);
  if (!agent) {
    agent = createAgent(fromDef(name, conversation));
    const saved = loadConversation(name, conversation);
    if (saved) agent.state.messages = saved as typeof agent.state.messages;
    sessions.set(key, agent);
  }
  return agent;
}

/** Before the next message: summarize older turns of a long conversation (unless the agent keeps every message). True when it did. */
export async function compactIfLong(name: string, key: string, agent: Agent) {
  if (loadDef(name).compact === false) return false;
  compacting.add(key);
  try { return await compact(agent); } finally { compacting.delete(key); }
}

/** Summarize older turns now (the chat's /compact command). */
export async function compactNow(name: string, conversation: string) {
  loadDef(name);
  const key = skey(name, conversation);
  const agent = getSession(name, conversation);
  if (agent.state.isStreaming || compacting.has(key)) throw new Error("Still working. Try again when the run finishes.");
  compacting.add(key);
  try {
    if (!(await compact(agent, { force: true }))) throw new Error("Nothing to compact yet: the conversation is still short.");
    await saveConversation(name, conversation, agent.state.messages);
  } finally { compacting.delete(key); }
}

/**
 * Abort a run. If the agent is still wedged in "streaming" after a grace period (a provider stream that
 * never settles), replace it with a fresh agent that keeps the transcript, so the conversation stays usable.
 */
export function stopSession(name: string, conversation: string) {
  const key = skey(name, conversation);
  taskStops.get(key)?.();
  const agent = sessions.get(key);
  if (!agent?.state.isStreaming) return;
  agent.abort();
  setTimeout(() => {
    if (sessions.get(key) !== agent || !agent.state.isStreaming) return;
    const fresh = createAgent(fromDef(name));
    fresh.state.messages = agent.state.messages;
    sessions.set(key, fresh);
    void saveConversation(name, conversation, fresh.state.messages);
  }, 3000);
}
