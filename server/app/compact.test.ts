import { expect, test } from "bun:test";
import { estimateTokens, splitPoint, transcriptText } from "./compact";
import { toChatMessages } from "../core/history";

const t = [
  { role: "user", content: "one" },
  { role: "assistant", content: [{ type: "toolCall", name: "bash", arguments: { command: "ls" } }] },
  { role: "toolResult", content: [{ type: "text", text: "x".repeat(5000) }] },
  { role: "user", content: "two" },
  { role: "assistant", content: [{ type: "text", text: "ok" }] },
  { role: "user", content: [{ type: "text", text: "three" }, { type: "image", data: "AA", mimeType: "image/png" }] },
];

test("keeps the last two user turns and never splits a tool call from its result", () => {
  expect(splitPoint(t)).toBe(3);
  expect(splitPoint(t.slice(0, 5))).toBe(0); // only two turns: nothing to compact
  expect(splitPoint([{ role: "user", content: "s", compacted: true }, ...t.slice(3)])).toBe(0); // the summary isn't a turn
});

test("estimates tokens from text and images, and clips tool output for the summarizer", () => {
  expect(estimateTokens(t)).toBeGreaterThan(1_250 + 1_500);
  const text = transcriptText(t.slice(0, 3));
  expect(text).toContain('[called bash({"command":"ls"})]');
  expect(text.length).toBeLessThan(2_000);
});

test("a compacted summary shows as a summary message, not a user bubble", () => {
  const msgs = toChatMessages([{ role: "user", content: "Summary of the earlier conversation (older messages were compacted):\n\nGoal: X", compacted: true }, ...t.slice(3)] as any);
  expect(msgs[0]).toMatchObject({ role: "user", kind: "summary", parts: [{ type: "text", text: "Goal: X" }] });
  expect(msgs[1]!.kind).toBeUndefined();
});
