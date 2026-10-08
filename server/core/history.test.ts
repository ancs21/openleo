import { expect, test } from "bun:test";
import { toChatMessages } from "./history";

test("a pi transcript becomes user + assistant messages with tool parts", () => {
  const msgs = toChatMessages([
    { role: "system", content: "You are…", timestamp: 1 },
    { role: "user", content: "save a note", timestamp: 2 },
    { role: "assistant", content: [{ type: "text", text: "On it." }, { type: "toolCall", id: "c1", name: "write_file", arguments: { path: "n.txt" } }], timestamp: 3 },
    { role: "toolResult", toolCallId: "c1", content: [{ type: "text", text: "wrote 5 bytes" }], isError: false, timestamp: 4 },
    { role: "assistant", content: [{ type: "text", text: "Saved n.txt." }], timestamp: 5 },
    { role: "user", content: [{ type: "text", text: "look" }, { type: "image", data: "AAAA", mimeType: "image/png" }], timestamp: 6 },
  ]);
  expect(msgs.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
  expect(msgs[1]!.parts).toEqual([
    { type: "text", text: "On it." },
    { type: "dynamic-tool", toolCallId: "c1", toolName: "write_file", input: { path: "n.txt" }, state: "output-available", output: "wrote 5 bytes" },
    { type: "text", text: "Saved n.txt." },
  ]);
  expect(msgs[1]!.startedAt).toBe(3);
  expect(msgs[1]!.endedAt).toBe(5);
  expect(msgs[2]!.parts[1]).toEqual({ type: "file", url: "data:image/png;base64,AAAA", mediaType: "image/png" });
});

test("a tool call without a result is pending while running, stopped after", () => {
  const t = [
    { role: "user", content: "sleep", timestamp: 1 },
    { role: "assistant", content: [{ type: "toolCall", id: "c1", name: "bash", arguments: {} }], timestamp: 2 },
  ];
  expect((toChatMessages(t, true)[1]!.parts[0] as any).state).toBe("input-available");
  expect(toChatMessages(t)[1]!.parts[0]).toMatchObject({ state: "output-error", output: "Stopped" });
});

test("saved web search steps show as tool rows before the reply text", () => {
  const msgs = toChatMessages([
    { role: "user", content: "news?" },
    { role: "assistant", content: [{ type: "text", text: "Here you go." }], webSearches: [
      { id: "ws1", action: { type: "search", query: "news today", sources: [{ url: "https://apnews.com" }, { url: "https://apnews.com" }, { url: "https://bbc.com" }] } },
      { id: "ws2", action: { type: "open_page", url: "https://apnews.com" } },
    ] },
  ] as any);
  expect(msgs[1]!.parts.map((p: any) => p.output ?? p.text)).toEqual(["Searched: news today\nhttps://apnews.com\nhttps://bbc.com", "Opened https://apnews.com", "Here you go."]);
});

test("adjacent reasoning chunks merge into one thought", () => {
  const msgs = toChatMessages([
    { role: "user", content: "hi" },
    { role: "assistant", content: [{ type: "thinking", thinking: "**Plan A**" }, { type: "thinking", thinking: "**Plan B**" }, { type: "text", text: "Hello" }] },
  ] as any);
  expect(msgs[1]!.parts).toEqual([{ type: "reasoning", text: "**Plan A**\n\n**Plan B**" }, { type: "text", text: "Hello" }]);
});
