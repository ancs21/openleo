// Agent layer on pi: an agent is a function that calls hooks and returns its system prompt.
//
//   export function Researcher() {
//     useModel("openai/gpt-6-luna");
//     useTool(fetchUrl);
//     useSubagent("writer", "Writes the final report", Writer);
//     return "You research topics thoroughly.";
//   }
import { Agent, type AgentTool, type StreamFn } from "@earendil-works/pi-agent-core";
import { createAssistantMessageEventStream, isRetryableAssistantError, Type, type ThinkingLevel, type TSchema } from "@earendil-works/pi-ai";
import { builtinModels } from "@earendil-works/pi-ai/providers/all";
import { tenantCredentials } from "./credentials";
import { currentTenant } from "./tenant";
import { LEO_MODEL } from "../../shared/types";

import type { WebSearchAction } from "../core/history";

export type AgentFn = () => string;
export type WebSearchEvent = { phase: "start" | "end"; id: string; action?: WebSearchAction };
const webSearchListeners = new WeakMap<Agent, Set<(e: WebSearchEvent) => void>>();

/** Follow an agent's provider web-search steps (they don't go through pi's tool events). */
export function onWebSearch(agent: Agent, fn: (e: WebSearchEvent) => void) {
  const set = webSearchListeners.get(agent);
  set?.add(fn);
  return () => void set?.delete(fn);
}
type Spec = { model?: string; effort?: ThinkingLevel | "off"; webSearch?: boolean; tools: AgentTool<any>[]; prompt: string; context?: () => Promise<string> };

/** Each tenant gets its own model registry, built on its own credentials. */
const registries = new Map<string, ReturnType<typeof builtinModels>>();
export function models() {
  const tenant = currentTenant();
  let registry = registries.get(tenant);
  if (!registry) registries.set(tenant, (registry = builtinModels({ credentials: tenantCredentials(tenant) })));
  return registry;
}
const MAX_DEPTH = 5; // fixed delegation depth; make configurable if deeper chains are needed

let current: { spec: Spec; depth: number } | null = null;
function ctx() {
  if (!current) throw new Error("hooks can only be called inside an agent function");
  return current;
}

// Typed tool definition; params are inferred from the TypeBox schema.
export const defineTool = <T extends TSchema>(tool: AgentTool<T>) => tool as unknown as AgentTool<any>;

export const useModel = (id: string) => void (ctx().spec.model = id);
export const useEffort = (level: ThinkingLevel | "off") => void (ctx().spec.effort = level);
// The provider's own web search (OpenAI Responses models only; other models just don't get it).
export const useWebSearch = () => void (ctx().spec.webSearch = true);
export const supportsWebSearch = (model: { api: string }) => model.api === "openai-responses";
export const useTool = (tool: AgentTool<any>) => void ctx().spec.tools.push(tool);
// Text read fresh before every model request and added to the system prompt, never saved in the chat
// (it can change between runs, like the board's memory).
export const useContext = (fn: () => Promise<string>) => void (ctx().spec.context = fn);

// Delegation: each call runs a fresh child agent and returns its final answer.
export function useSubagent(name: string, description: string, fn: AgentFn) {
  const { spec, depth } = ctx();
  if (depth >= MAX_DEPTH) return;
  spec.tools.push(defineTool({
    name: `ask_${name.replace(/\W/g, "_")}`,
    label: `Ask ${name}`,
    description: `Delegate a task to the "${name}" subagent. ${description}`,
    parameters: Type.Object({ task: Type.String({ description: "Full task with all context the subagent needs" }) }),
    execute: async (_id, { task }, signal) => {
      const child = createAgent(fn, depth + 1);
      signal?.addEventListener("abort", () => child.abort());
      await child.prompt(task);
      return { content: [{ type: "text", text: lastText(child) || "(no answer)" }], details: {} };
    },
  }));
}

export function compile(fn: AgentFn, depth = 0): Spec {
  const prev = current;
  current = { spec: { tools: [], prompt: "" }, depth };
  try {
    current.spec.prompt = fn();
    return current.spec;
  } finally {
    current = prev;
  }
}

export function resolveModel(id: string) {
  const i = id.indexOf("/");
  const model = models().getModel(id.slice(0, i), id.slice(i + 1));
  if (!model) throw new Error(`unknown model "${id}" (use provider/model-id)`);
  return model;
}

const RETRIES = 2;
const EMPTY_USAGE = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
/**
 * A request the provider drops or turns away for a moment (a cut-off stream, overload) is sent again, as long as
 * no answer or tool call has shown yet. Usage limits and bad requests aren't retried.
 */
export function withRetry(streamFn: StreamFn, wait: (ms: number) => Promise<void> = Bun.sleep): StreamFn {
  return (model, context, options) => {
    const out = createAssistantMessageEventStream();
    void (async () => {
      for (let attempt = 0; ; attempt++) {
        let shown = false, retry = false;
        try {
          for await (const e of await streamFn(model, context, options)) {
            if (e.type === "error" && !shown && attempt < RETRIES && !options?.signal?.aborted
              && isRetryableAssistantError({ ...e.error, stopReason: "error" })) { retry = true; break; }
            if (e.type === "start" && attempt > 0) continue; // the agent already has this reply's message
            if (e.type !== "start" && !e.type.startsWith("thinking")) shown = true;
            out.push(e);
          }
        } catch (err) { if (shown || attempt >= RETRIES) throw err; retry = true; }
        if (!retry) return;
        await wait(1000 * 3 ** attempt);
      }
    })().catch((err) => out.push({ type: "error", reason: "error", error: { role: "assistant", content: [], api: model.api, provider: model.provider, model: model.id, usage: EMPTY_USAGE, stopReason: "error", errorMessage: (err as Error).message, timestamp: Date.now() } }))
      .finally(() => out.end());
    return out;
  };
}

export function createAgent(fn: AgentFn, depth = 0) {
  const spec = compile(fn, depth);
  const registry = models(); // this tenant's models and credentials
  const listeners = new Set<(e: WebSearchEvent) => void>();
  let steps: { id: string; action?: WebSearchAction }[] = [];
  const watch = (e: any) => {
    if (e?.item?.type !== "web_search_call") return;
    if (e.type === "response.output_item.added") for (const l of listeners) l({ phase: "start", id: e.item.id });
    if (e.type === "response.output_item.done") {
      steps.push({ id: e.item.id, action: e.item.action });
      for (const l of listeners) l({ phase: "end", id: e.item.id, action: e.item.action });
    }
  };
  const agent = new Agent({
    initialState: {
      systemPrompt: spec.prompt,
      model: resolveModel(spec.model ?? LEO_MODEL),
      thinkingLevel: spec.effort ?? "medium", // pi's own default is "off", which turns reasoning off entirely
      tools: spec.tools,
    },
    streamFn: withRetry(spec.webSearch
      ? (model, context, options) => registry.streamSimple(model, context, {
          ...options,
          // Checked per request, so switching the agent to another provider mid-chat is safe.
          onPayload: async (payload: any, m) => {
            const p = (await options?.onPayload?.(payload, m)) ?? payload;
            if (supportsWebSearch(m)) {
              p.tools = [...(p.tools ?? []), { type: "web_search" }];
              p.include = [...new Set([...(p.include ?? []), "web_search_call.action.sources"])]; // result links, shown in the chat
            }
            return p;
          },
          onProviderStreamEvent: async (e, m) => { await options?.onProviderStreamEvent?.(e, m); watch(e); },
        })
      : registry.streamSimple.bind(registry)),
    transformContext: async (messages) => withContext(keepRecentImages(messages, 3), await spec.context?.()),
  });
  if (spec.webSearch) {
    webSearchListeners.set(agent, listeners);
    // Keep the steps on the reply they belong to, so the history can show them after a reload.
    agent.subscribe((e: any) => {
      if (e.type === "message_end" && e.message.role === "assistant" && steps.length) { e.message.webSearches = steps; steps = []; }
    });
  }
  return agent;
}

/** Add `extra` to the leading system message of what is sent (the saved chat keeps its own). */
export function withContext<T extends { role: string; content?: unknown }>(messages: T[], extra?: string): T[] {
  const [first, ...rest] = messages;
  if (!extra || first?.role !== "system" || typeof first.content !== "string") return messages;
  return [{ ...first, content: `${first.content}\n\n${extra}` }, ...rest];
}

// Computer use returns a screenshot per step; only the newest few stay in context (the rest become a note).
export function keepRecentImages<T extends { role: string; content?: unknown }>(messages: T[], keep: number): T[] {
  let seen = 0;
  return messages.toReversed().map((m) => {
    if (m.role !== "toolResult" || !Array.isArray(m.content) || !m.content.some((c: any) => c.type === "image")) return m;
    if (++seen <= keep) return m;
    return { ...m, content: m.content.map((c: any) => (c.type === "image" ? { type: "text", text: "[older screenshot removed]" } : c)) };
  }).reverse();
}

export function lastText(agent: Agent) {
  const msg = agent.state.messages.findLast((m: any) => m.role === "assistant") as any;
  if (!msg) return "";
  if (typeof msg.content === "string") return msg.content;
  return msg.content.filter((c: any) => c.type === "text").map((c: any) => c.text).join("");
}
