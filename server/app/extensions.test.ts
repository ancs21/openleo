import { expect, test } from "bun:test";
import { agentSkills, parseSkill } from "./skills";
import { parseMcpConfig } from "../infra/mcp";

test("a SKILL.md splits into description and instructions", () => {
  const s = parseSkill("brand-voice", "---\nname: brand-voice\ndescription: \"Use for customer copy\"\n---\n\nShort sentences.\nNo jargon.\n");
  expect(s).toEqual({ name: "brand-voice", description: "Use for customer copy", instructions: "Short sentences.\nNo jargon." });
  expect(parseSkill("plain", "Just do it.").instructions).toBe("Just do it.");
});

test("skill headers are real YAML: folded descriptions join up, a broken header keeps the instructions", () => {
  expect(parseSkill("pdf", "---\nname: pdf\ndescription: >\n  Fill in PDF forms\n  and merge files.\nlicense: MIT\n---\nSteps.").description).toBe("Fill in PDF forms and merge files.");
  expect(parseSkill("x", "---\ndescription: [unclosed\n---\nStill here.")).toEqual({ name: "x", description: "", instructions: "Still here." });
});

test("MCP config accepts http(s) addresses or a command, nothing else", () => {
  expect(parseMcpConfig({ url: " https://x.dev/mcp ", headers: { Authorization: "Bearer k", "bad key": "v", Empty: "" } }))
    .toEqual({ url: "https://x.dev/mcp", headers: { Authorization: "Bearer k" } });
  expect(parseMcpConfig({ command: "bunx some-server --flag" })).toEqual({ command: "bunx", args: ["some-server", "--flag"] });
  expect(() => parseMcpConfig({ url: "file:///etc/passwd" })).toThrow();
  expect(() => parseMcpConfig({})).toThrow();
});

test("an agent's skills: each from skills.sh or written by hand, valid names, no repeats", () => {
  expect(agentSkills([
    { name: "coding", description: "  When  writing code ", instructions: "Tests first." },
    { name: "pdf", description: "PDF", source: "anthropics/skills/pdf", programs: 8 },
    { name: "coding", instructions: "a second one with the same name" },
    { name: "../etc", instructions: "x" }, { name: "empty" }, { name: "bad-source", source: "../../x" }, "brand-voice",
  ])).toEqual([
    { name: "coding", description: "When writing code", instructions: "Tests first." },
    { name: "pdf", description: "PDF", source: "anthropics/skills/pdf", programs: 8 },
  ]);
  expect(agentSkills(undefined)).toEqual([]);
});
