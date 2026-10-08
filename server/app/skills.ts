// Skills: reusable know-how each agent chooses (its definition lists them: a skills.sh id, or text written by
// hand). Their files live in the board's computer, in a folder of the agent's own so agents never share them:
// ~/agents/<agent>/skills/<name>/SKILL.md (frontmatter with name + description, then the instructions), plus
// any scripts or reference files beside it, put there the first time the agent runs on that board.
// An agent's prompt lists only its own skills' names and descriptions; use_skill loads one when a task calls for it.
import { Type } from "@earendil-works/pi-ai";
import { defineTool } from "../infra/runtime";
import { computerState, currentBoard, GUEST_HOME, sbExec, sbWrite, shq } from "../infra/sandbox";
import { currentTenant } from "../infra/tenant";
import type { AgentSkill, Skill, SkillPreview, SkillResult } from "../../shared/types";

/** An agent's own skills folder in the board's computer (agent names are lowercase letters, digits and dashes). */
const skillsDir = (agent: string) => `${GUEST_HOME}/agents/${agent}/skills`;
const SKILL_NAME = /^(?=.{1,64}$)[a-z0-9]+(-[a-z0-9]+)*$/; // the spec's rule
const DIRECTORY = "https://skills.sh";
const MAX_FILES = 200, MAX_BYTES = 5 * 1024 * 1024;
/** A skills.sh skill id: owner/repo/skill (or source/skill), with no "." or ".." parts. */
const isSkillId = (id: string) => /^[\w.-]+(\/[\w.-]+){1,2}$/.test(id) && !id.split("/").some((p) => /^\.+$/.test(p));
const PROGRAM = /(^|\/)scripts\/|\.(py|sh|bash|js|mjs|cjs|ts|rb|pl|php)$/;

/** Run a script in the computer and return what it printed (without sbExec's exit line). */
export const shell = async (script: string) => (await sbExec(script)).replace(/\n\[[^\]\n]*\]$/, "");

export function parseSkill(name: string, text: string): Skill {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  let meta: any = {};
  try { meta = (m && Bun.YAML.parse(m[1]!)) ?? {}; } catch { /* a broken header still leaves the instructions */ }
  const description = typeof meta.description === "string" ? meta.description.replace(/\s+/g, " ").trim() : "";
  return { name, description, instructions: (m ? m[2]! : text).trim() };
}

async function saveSkill(dir: string, s: Skill) {
  if (!SKILL_NAME.test(s.name)) throw new Error("skill name must be lowercase letters, digits and single dashes");
  if (!s.instructions.trim()) throw new Error("a skill needs instructions");
  // JSON strings are valid YAML, so any description is safe in the header.
  await sbWrite(`${dir}/${s.name}/SKILL.md`, `---\nname: ${s.name}\ndescription: ${JSON.stringify(s.description.replace(/\s+/g, " ").trim())}\n---\n\n${s.instructions.trim()}\n`);
}

// ---- The skills.sh directory ----

export async function searchSkills(q: string): Promise<SkillResult[]> {
  const res = await fetch(`${DIRECTORY}/api/search?${new URLSearchParams({ q, limit: "24" })}`, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`skills.sh search failed (${res.status})`);
  const body = (await res.json()) as { skills?: { id: string; name: string; source: string; installs: number }[] };
  return (body.skills ?? []).map(({ id, name, source, installs }) => ({ id, name, source, installs }));
}

type SkillFile = { path: string; contents: string };

/** A fingerprint of a skill's files (SHA-256 over every path and its contents, in path order). */
export function skillHash(files: SkillFile[]) {
  const h = new Bun.CryptoHasher("sha256");
  for (const f of [...files].sort((a, b) => (a.path < b.path ? -1 : 1))) h.update(`${f.path}\0${f.contents.length}\0${f.contents}`);
  return h.digest("hex");
}

/**
 * A directory skill's files, checked: safe relative paths, a size cap, a SKILL.md, and, given `hash`, exactly
 * the files that were checked before adding it (a skill changed since then is refused, not installed).
 */
export async function fetchSkill(id: string, hash?: string) {
  if (!isSkillId(id)) throw new Error("not a skills.sh skill id");
  const res = await fetch(`${DIRECTORY}/api/download/${id.split("/").map(encodeURIComponent).join("/")}`, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`skills.sh couldn't send this skill (${res.status})`);
  const files = ((await res.json()) as { files?: { path: string; contents?: string }[] }).files ?? [];
  const safe = (p: string) => /^[\w.-]+(\/[\w.-]+)*$/.test(p) && !p.split("/").some((s) => s === ".." || s === ".");
  if (!files.length || files.length > MAX_FILES || !files.every((f) => safe(f.path) && typeof f.contents === "string"))
    throw new Error("this skill has files OpenLeo can't add");
  if (files.reduce((n, f) => n + f.contents!.length, 0) > MAX_BYTES) throw new Error("this skill is too big (over 5 MB)");
  const main = files.find((f) => f.path === "SKILL.md");
  if (!main) throw new Error("this skill has no SKILL.md");
  const last = id.split("/").pop()!.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const named = (/^---[\s\S]*?\nname:\s*["']?([a-z0-9-]+)/.exec(main.contents!) ?? [])[1];
  const name = named && SKILL_NAME.test(named) ? named : last;
  if (!SKILL_NAME.test(name)) throw new Error("this skill's name isn't valid");
  const checked = files as SkillFile[];
  if (hash && skillHash(checked) !== hash) throw new Error(`skill "${name}" changed since it was checked; add it again to see what changed`);
  return { name, header: parseSkill(name, main.contents!), files: checked, hash: skillHash(checked) };
}

export async function previewSkill(id: string): Promise<SkillPreview> {
  const { name, header, files, hash } = await fetchSkill(id);
  return {
    id, name, hash, description: header.description, instructions: header.instructions.slice(0, 20_000),
    files: files.map((f) => ({ path: f.path, size: f.contents.length })),
    programs: files.filter((f) => PROGRAM.test(f.path)).length,
  };
}

/** Write a directory skill into `dir/<name>` in the board's computer, replacing an older copy of it. */
async function installSkill(dir: string, skill: AgentSkill) {
  const { files } = await fetchSkill(skill.source!, skill.hash);
  const folder = `${dir}/${skill.name}`;
  await shell(`rm -rf ${shq(folder)}`);
  for (const f of files) await sbWrite(`${folder}/${f.path}`, f.contents);
}

// ---- An agent's skills ----

/** An agent's skills from untrusted input: each from skills.sh (its id) or written by hand, named by the spec's rule. */
export function agentSkills(v: any): AgentSkill[] {
  if (!Array.isArray(v)) return [];
  const seen = new Set<string>();
  return v.flatMap((s): AgentSkill[] => {
    if (!s || typeof s.name !== "string" || !SKILL_NAME.test(s.name) || seen.has(s.name)) return [];
    seen.add(s.name);
    const description = String(s.description ?? "").replace(/\s+/g, " ").trim().slice(0, 1024);
    if (typeof s.instructions === "string" && s.instructions.trim()) return [{ name: s.name, description, instructions: s.instructions.slice(0, 100_000) }];
    if (typeof s.source === "string" && isSkillId(s.source))
      return [{
        name: s.name, description, source: s.source,
        ...(Number.isInteger(s.programs) && s.programs > 0 ? { programs: s.programs } : {}),
        ...(typeof s.hash === "string" && /^[0-9a-f]{64}$/.test(s.hash) ? { hash: s.hash } : {}),
      }];
    return [];
  }).slice(0, 50);
}

/** What syncing an agent's skills does to its folder, given the skill folders already there. */
export function planSync(present: string[], skills: AgentSkill[]) {
  const wanted = new Set(skills.map((s) => s.name));
  return {
    write: skills.filter((s) => s.instructions), // hand-written: always from the definition, so edits reach every board
    install: skills.filter((s) => !s.instructions && s.source && !present.includes(s.name)),
    remove: present.filter((name) => !wanted.has(name)), // skills the agent no longer has
  };
}

const RETRY_MS = 5 * 60_000; // a skill that failed to install is tried again after this
// "<tenant>/<board>/<agent>" -> the skills last synced there and which of them are ready
const synced = new Map<string, { list: string; ready: string[]; failed: boolean; at: number }>();
const syncKey = (agent: string) => `${currentTenant()}/${currentBoard()}/${agent}`;

/**
 * Make the agent's folder in the board's computer match its skills, and return the names that are ready to use.
 * Runs again only when the list changes, a skill failed (after RETRY_MS), or use_skill finds a folder missing.
 */
export async function syncSkills(agent: string, skills: AgentSkill[]): Promise<string[]> {
  const key = syncKey(agent), list = JSON.stringify(skills), hit = synced.get(key);
  if (hit?.list === list && !(hit.failed && Date.now() - hit.at > RETRY_MS)) return hit.ready;
  const dir = skillsDir(agent);
  const present = (await shell(`ls ${shq(dir)} 2>/dev/null`)).split("\n").filter((n) => SKILL_NAME.test(n));
  const plan = planSync(present, skills);
  if (plan.remove.length) await shell(`cd ${shq(dir)} && rm -rf ${plan.remove.map(shq).join(" ")}`);
  const place = (s: AgentSkill) => (s.instructions ? saveSkill(dir, { name: s.name, description: s.description, instructions: s.instructions }) : installSkill(dir, s));
  const failed = new Set<string>();
  for (const s of [...plan.write, ...plan.install]) {
    await place(s).catch((e) => { failed.add(s.name); console.warn(`skill ${s.name} for ${agent}: ${(e as Error).message}`); });
  }
  const ready = skills.map((s) => s.name).filter((n) => !failed.has(n));
  synced.set(key, { list, ready, failed: failed.size > 0, at: Date.now() });
  return ready;
}

/**
 * Sync an agent's skills into its board's computer if that's on now (otherwise they go in on the agent's first
 * run there, so saving never starts a computer). Says whether it did, and which skills failed.
 */
export async function syncIfRunning(agent: string, skills: AgentSkill[]) {
  if (!skills.length || computerState(currentBoard()).state !== "running") return { installed: false, failed: [] as string[] };
  const ready = await syncSkills(agent, skills).catch(() => [] as string[]);
  return { installed: true, failed: skills.map((s) => s.name).filter((n) => !ready.includes(n)) };
}

/** The Skills part of an agent's prompt (only skills that are ready in the computer). */
export const skillsPrompt = (agent: string, skills: AgentSkill[]) => skills.length
  ? `## Skills\nWhen a task matches one of these skills, call use_skill first to load its instructions, then follow them. They live in ${skillsDir(agent)}.\n${skills.map((s) => `- ${s.name}: ${s.description.slice(0, 300)}`).join("\n")}`
  : "";

/** Loads one of the agent's skills when it picks it; the skill's other files stay in the computer to use from there. */
export const useSkillTool = (agent: string, skills: AgentSkill[]) => defineTool({
  name: "use_skill",
  label: "Use skill",
  description: `Load the full instructions of one of your skills: ${skills.map((s) => s.name).join(", ")}.`,
  parameters: Type.Object({ name: Type.String({ description: "Skill name" }) }),
  execute: async (_id, { name }) => {
    if (!skills.some((s) => s.name === name) || !SKILL_NAME.test(name)) throw new Error(`no skill "${name}"`);
    const dir = `${skillsDir(agent)}/${name}`;
    const read = () => shell(`cd ${shq(dir)} 2>/dev/null || { echo '@@MISSING'; exit 0; }; cat SKILL.md; printf '\\n@@FILES\\n'; find . -type f ! -name SKILL.md | sed 's|^\\./||' | head -100`);
    let out = await read();
    if (out.startsWith("@@MISSING")) { // removed from the computer since the last sync (or the computer was rebuilt): put it back once
      synced.delete(syncKey(agent));
      if ((await syncSkills(agent, skills)).includes(name)) out = await read();
    }
    if (out.startsWith("@@MISSING")) throw new Error(`skill "${name}" isn't available in this computer right now`);
    const [text, list = ""] = out.split("\n@@FILES\n");
    const files = list.trim();
    const where = `This skill's folder is ${dir}${files ? `. Its other files (read or run them from there when the instructions say so):\n${files}` : "."}`;
    return { content: [{ type: "text", text: `${parseSkill(name, text!).instructions}\n\n---\n${where}` }], details: {} };
  },
});
