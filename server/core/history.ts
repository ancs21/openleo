// Converts an agent transcript into chat UI message parts (one assistant message per user turn).
import type { Message, Part, ToolPart } from "../../shared/types";

type Content = { type: string; text?: string; thinking?: string; id?: string; name?: string; arguments?: unknown; data?: string; mimeType?: string };
type PiMessage = { webSearches?: { id: string; action?: WebSearchAction }[]; role: string; content?: string | Content[]; toolCallId?: string; isError?: boolean; timestamp?: number; errorMessage?: string; compacted?: boolean };

export type WebSearchAction = { type: string; query?: string; queries?: string[]; url?: string; pattern?: string; sources?: { url?: string }[] };

/** One line for a provider web-search step ("Searched …", "Opened …"). */
export function searchSummary(a?: WebSearchAction) {
  if (a?.type === "open_page") return `Opened ${a.url}`;
  if (a?.type === "find") return `Looked for "${a.pattern}" in ${a.url}`;
  const links = [...new Set((a?.sources ?? []).map((s) => s.url).filter(Boolean))].slice(0, 10);
  return [`Searched: ${a?.query ?? a?.queries?.join(" · ") ?? "the web"}`, ...links].join("\n");
}

const textOf = (c: string | Content[] | undefined) =>
  typeof c === "string" ? c : (c ?? []).filter((x) => x.type === "text").map((x) => x.text ?? "").join("");

export function toChatMessages(transcript: PiMessage[], running = false): Message[] {
  const out: Message[] = [];
  let reply: Message | null = null;
  const tools = new Map<string, ToolPart>();

  for (const [i, m] of transcript.entries()) {
    if (m.role === "user" && m.compacted) {
      out.push({ id: `h${i}`, role: "user", kind: "summary", startedAt: m.timestamp, parts: [{ type: "text", text: textOf(m.content).replace(/^Summary of the earlier conversation[^\n]*\n+/, "") }] });
      reply = null;
    } else if (m.role === "user") {
      const images = Array.isArray(m.content) ? m.content.filter((c) => c.type === "image") : [];
      out.push({
        id: `h${i}`, role: "user", startedAt: m.timestamp,
        parts: [{ type: "text", text: textOf(m.content) }, ...images.map((c): Part => ({ type: "file", url: `data:${c.mimeType};base64,${c.data}`, mediaType: c.mimeType ?? "image/png" }))],
      });
      reply = null;
    } else if (m.role === "assistant") {
      if (!reply) out.push((reply = { id: `h${i}`, role: "assistant", parts: [], startedAt: m.timestamp }));
      for (const w of m.webSearches ?? []) {
        reply.parts.push({ type: "dynamic-tool", toolCallId: w.id, toolName: "web_search", input: w.action, state: "output-available", output: searchSummary(w.action) });
      }
      for (const c of Array.isArray(m.content) ? m.content : []) {
        if (c.type === "text" && c.text) reply.parts.push({ type: "text", text: c.text });
        else if (c.type === "thinking" && c.thinking) {
          // One thought block per reply stretch, like the live view: adjacent reasoning chunks are merged.
          const last = reply.parts.at(-1);
          if (last?.type === "reasoning") last.text += `\n\n${c.thinking}`;
          else reply.parts.push({ type: "reasoning", text: c.thinking });
        }
        else if (c.type === "toolCall" && c.id) {
          const part: ToolPart = { type: "dynamic-tool", toolCallId: c.id, toolName: c.name ?? "tool", input: c.arguments, state: "input-available" };
          tools.set(c.id, part);
          reply.parts.push(part);
        }
      }
      if (m.errorMessage) reply.parts.push({ type: "text", text: `⚠️ ${m.errorMessage}` });
      reply.endedAt = m.timestamp;
    } else if (m.role === "toolResult" && m.toolCallId) {
      const part = tools.get(m.toolCallId);
      if (!part) continue;
      const content = Array.isArray(m.content) ? m.content : [];
      const img = content.find((c) => c.type === "image");
      part.state = m.isError ? "output-error" : "output-available";
      part.output = textOf(content).slice(0, 2000);
      if (img) part.image = `data:${img.mimeType};base64,${img.data}`;
      if (reply) reply.endedAt = m.timestamp;
    }
    // system messages are config, not conversation
  }
  // A tool call without a result after the run ended was interrupted.
  if (!running) for (const part of tools.values()) if (part.state === "input-available") Object.assign(part, { state: "output-error", output: "Stopped" });
  return out;
}
