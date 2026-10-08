import { expect, test } from "bun:test";
import { compile, keepRecentImages, useModel, useSubagent, useTool, withContext } from "./runtime";
import { inWorkspace, tools } from "../app/tools";
import { inTenant } from "./tenant";

test("hooks compile into a spec, subagents become ask_* tools, recursion is capped", () => {
  const Loop = () => (useSubagent("loop", "self", Loop), "loop");
  const Boss = () => {
    useModel("openai/gpt-6-luna");
    useTool(tools.read_file!);
    useSubagent("loop", "recursive helper", Loop);
    return "boss prompt";
  };
  const spec = compile(Boss);
  expect(spec.prompt).toBe("boss prompt");
  expect(spec.model).toBe("openai/gpt-6-luna");
  expect(spec.tools.map((t) => t.name)).toEqual(["read_file", "ask_loop"]);
  expect(compile(Loop, 5).tools).toEqual([]); // depth cap stops infinite delegation
  expect(() => useModel("x/y")).toThrow(); // hooks outside an agent fail loudly
});

test("host-mode file paths cannot escape the tenant's workspace", () => inTenant("0123456789abcdef", () => {
  expect(() => inWorkspace("../package.json")).toThrow("escapes workspace");
  expect(() => inWorkspace("/etc/passwd")).toThrow("escapes workspace");
  expect(inWorkspace("notes/a.md")).toEndWith("tenants/0123456789abcdef/workspace/notes/a.md");
}));

test("only the newest screenshots stay in model context", () => {
  const shot = (n: number) => ({ role: "toolResult", content: [{ type: "text", text: `step ${n}` }, { type: "image", data: `img${n}`, mimeType: "image/jpeg" }] });
  const msgs = [{ role: "user", content: "go" }, shot(1), shot(2), shot(3), shot(4)];
  const out = keepRecentImages(msgs, 2) as any[];
  const images = out.flatMap((m) => (Array.isArray(m.content) ? m.content : [])).filter((c: any) => c.type === "image").map((c: any) => c.data);
  expect(images).toEqual(["img3", "img4"]);
  expect(out[1].content[1].text).toBe("[older screenshot removed]");
  expect(msgs[1]!.content[1]).toHaveProperty("type", "image"); // original transcript untouched
});

test("board context joins the system prompt sent to the model, not the saved chat", () => {
  const saved = [{ role: "system", content: "You write." }, { role: "user", content: "hi" }];
  const sent = withContext(saved, "## This board's notes\nShort.");
  expect(sent[0]).toEqual({ role: "system", content: "You write.\n\n## This board's notes\nShort." });
  expect(saved[0]!.content).toBe("You write."); // the chat on disk is untouched
  expect(withContext(saved, "")).toBe(saved);
});
