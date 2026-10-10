// API types shared by the server and the web app.
import type { Field } from "./fields";
import type { Schedule } from "./schedule";

export type AgentDef = {
  /** the ID: lowercase words and dashes, used in links and mentions */
  name: string;
  /** the display name; unset: the ID */
  title?: string;
  description: string;
  icon?: string;
  model: string;
  instructions: string;
  subagents: string[];
  skills?: AgentSkill[];
  mcp?: string[];
  /** unset: medium */
  effort?: Effort;
  /** false keeps every message; otherwise older turns are summarized near the context limit */
  compact?: boolean;
};

export const EFFORTS = ["off", "low", "medium", "high", "xhigh", "max"] as const;
export type Effort = (typeof EFFORTS)[number];
export type Tuning = { model: string } | { effort: Effort };
export const EFFORT_LABEL: Record<Effort, string> = { off: "Instant", low: "Light", medium: "Standard", high: "Extended", xhigh: "Heavy", max: "Max" };

export type Skill = { name: string; description: string; instructions: string };
/** From the skills directory (`source`: owner/repo/skill, `hash`: of the files checked before adding) or hand-written (`instructions`). */
export type AgentSkill = { name: string; description: string; source?: string; programs?: number; instructions?: string; hash?: string };
export type SkillResult = { id: string; name: string; source: string; installs: number };
export type SkillPreview = { id: string; name: string; hash: string; description: string; instructions: string; files: { path: string; size: number }[]; programs: number };
export type BoardNotes = { agents: string; soul: string; user: string; memory: string; days: { date: string; text: string }[] };

export type McpServerInfo = {
  name: string; url?: string; command?: string; headerNames: string[];
  connected: boolean; error?: string; tools: { name: string; label: string; description: string }[];
};

export type CatalogApp = {
  slug: string; name: string; category: string; url: string; auth: "API key" | "OAuth or API key" | "None";
  summary: string; docs: string; icon?: { path: string; hex: string };
};

export type SandboxInfo = { sandboxed: boolean; on: "local" | "cloud" };

export type ChatGPTStatus = { signedIn: boolean; email?: string; pending?: boolean; error?: string; revoked?: boolean };

/** The board's built-in assistant, not one of the user's agents. `LEO_MODEL`: its model until one is chosen. */
export const LEO = "leo", LEO_MODEL = "openai/gpt-6-luna";
/** The built-in agent behind a board's nightly memory-tidy card. */
export const MEMORY_KEEPER = "memory-keeper";

export type TaskStatus = "todo" | "running" | "done" | "error";
export type TaskCard = {
  id: string; num: number; kind: "task";
  title: string; notes: string;
  /** the latest run's agent; `agents`: every agent that has worked on it */
  agent?: string; agents?: string[]; status: TaskStatus; result?: string; ranAt?: number;
  /** `nextRunAt` (server-owned): the next scheduled run, unless paused */
  schedule?: Schedule; nextRunAt?: number;
  /** newest last (server-owned); `failStreak`: scheduled runs that failed in a row */
  runs?: TaskRun[]; failStreak?: number;
  values?: Record<string, string>;
  /** server-owned: a GitHub item (`github:owner/repo#12`), or "welcome" for a new board's how-tos */
  source?: string;
};
export type Card = TaskCard;
/** Cards from before `agents` existed have only `agent`. */
export const taskAgents = (c: TaskCard) => c.agents ?? (c.agent ? [c.agent] : []);
export type TaskRun = { at: number; agent: string; how: "manual" | "schedule" | "added"; status: "done" | "error" | "skipped"; note?: string };
/** `agent`: works on every card added to this list. */
export type List = {
  id: string; title: string; cards: string[]; agent?: string; icon?: string;
  /** shows this GitHub search's results instead of its own cards */
  source?: ListSource;
};
export type ListSource = { kind: "github"; query: string };
/** One GitHub search result in a synced list. `key` is stamped on a card made from it. */
export type GithubRow = { key: string; ref: string; title: string; url: string; status: string; by?: string };
export type Board = {
  title: string; lists: List[]; cards: Record<string, Card>; nextNum: number;
  fields?: Field[];
  /** bumped on every layout change; a save from an older copy is refused (an agent may have changed the board) */
  rev?: number;
  computer?: string;
};
export type BoardInfo = { id: string; title: string };
export type ComputerInfo = { state: "off" | "starting" | "running" | "error"; name: string; error?: string };

export type ToolPart = {
  type: "dynamic-tool";
  toolCallId: string;
  toolName: string;
  input: unknown;
  state: "input-available" | "output-available" | "output-error";
  output?: string;
  image?: string;
};
export type FilePart = { type: "file"; url: string; mediaType: string };
export type Part = { type: "text"; text: string } | { type: "reasoning"; text: string } | ToolPart | FilePart;
export type Message = { id: string; role: "user" | "assistant"; parts: Part[]; startedAt?: number; endedAt?: number; kind?: "summary" };

export type Wallpaper = {
  id: string;
  thumb: string;
  url: string;
  color: string; // shown while the image loads
  author: string;
  authorUrl: string;
  photoUrl: string;
  downloadLocation: string; // ping when chosen (Unsplash API guideline)
};
/** `builtIn`: no Unsplash key, so these come from the built-in list. */
export type WallpaperResults = { enabled: boolean; photos: Wallpaper[]; builtIn?: boolean };

export const agentLabel = (a: Pick<AgentDef, "name" | "title">) => a.title || a.name;
