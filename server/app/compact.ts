// Near the context window, older turns are summarized into one message; the last few user turns stay verbatim.
// The summary is saved in the transcript (marked `compacted`), so it happens once, not on every request.
import type { Agent } from "@earendil-works/pi-agent-core";
import { models } from "../infra/runtime";

const KEEP_TURNS = 2; // most recent user turns kept word for word
const THRESHOLD = 0.75; // share of the context window that triggers automatic compaction
const IMAGE_TOKENS = 1_500;

type Msg = { role: string; content?: unknown; compacted?: boolean; timestamp?: number };
type Block = { type: string; text?: string; thinking?: string; name?: string; arguments?: unknown };

const blocks = (m: Msg): Block[] => (typeof m.content === "string" ? [{ type: "text", text: m.content }] : Array.isArray(m.content) ? m.content : []);

/** Rough token count: ~4 characters per token, a flat cost per image. */
export function estimateTokens(messages: Msg[]) {
  let chars = 0, images = 0;
  for (const m of messages) for (const b of blocks(m)) {
    if (b.type === "image") images++;
    else chars += (b.text ?? b.thinking ?? "").length + (b.arguments ? JSON.stringify(b.arguments).length : 0);
  }
  return Math.ceil(chars / 4) + images * IMAGE_TOKENS;
}

/** Index of the first message to keep: the start of the KEEP_TURNS-th last user turn (never splits a tool call from its result). */
export function splitPoint(messages: Msg[], keepTurns = KEEP_TURNS) {
  const starts = messages.flatMap((m, i) => (m.role === "user" && !m.compacted ? [i] : []));
  return starts.length > keepTurns ? starts[starts.length - keepTurns]! : 0;
}

export function transcriptText(messages: Msg[]) {
  return messages.map((m) => {
    const body = blocks(m).map((b) =>
      b.type === "text" ? b.text
      : b.type === "toolCall" ? `[called ${b.name}(${JSON.stringify(b.arguments).slice(0, 500)})]`
      : b.type === "image" ? "[image]"
      : "").filter(Boolean).join("\n");
    const who = m.compacted ? "earlier summary" : m.role === "toolResult" ? "tool result" : m.role;
    return `### ${who}\n${m.role === "toolResult" ? body.slice(0, 1_500) : body}`;
  }).join("\n\n");
}

const SUMMARY_PROMPT = `You compress a conversation between a user and an AI agent so the agent can continue the work without the original messages.
Write a concise summary with these parts, skipping any that are empty:
- Goal: what the user wants overall.
- Requests and decisions: what was asked, agreed or ruled out.
- Facts and results: exact values, names, file paths, URLs, numbers and findings the agent may need again.
- Progress: what is done, what is in progress, and the next steps.
Keep exact details; drop pleasantries and repetition. Write in the language of the conversation.`;

/** Summarize all but the last few turns into one message (`force`: regardless of size). False when there is nothing to compact. */
export async function compact(agent: Agent, { force = false } = {}) {
  const messages = agent.state.messages as Msg[];
  const model = agent.state.model;
  if (!force && estimateTokens(messages) < model.contextWindow * THRESHOLD) return false;
  const cut = splitPoint(messages);
  if (cut === 0) return false;

  const reply = await models().completeSimple(model, {
    systemPrompt: SUMMARY_PROMPT,
    messages: [{ role: "user", content: transcriptText(messages.slice(0, cut)), timestamp: Date.now() }],
  } as any);
  const summary = reply.content.filter((c: any) => c.type === "text").map((c: any) => c.text).join("").trim();
  if (!summary) throw new Error(reply.errorMessage ?? "couldn't summarize the conversation");

  const note = { role: "user", content: `Summary of the earlier conversation (older messages were compacted):\n\n${summary}`, compacted: true, timestamp: Date.now() };
  agent.state.messages = [note, ...messages.slice(cut)] as typeof agent.state.messages;
  return true;
}
