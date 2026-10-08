// Types shared by the Bun server and the React app (one source of truth for API shapes).
import type { Field } from "./fields";
import type { Schedule } from "./schedule";

export type AgentDef = {
  /** its ID: lowercase words and dashes, used in links, lists and mentions */
  name: string;
  /** the name people see ("Crypto Researcher"); unset: the ID */
  title?: string;
  description: string;
  /** a line icon's name (shared/icons.ts) shown with the agent's name */
  icon?: string;
  model: string;
  instructions: string;
  subagents: string[];
  /** skills this agent uses; their files are put in the board's computer when it runs there */
  skills?: AgentSkill[];
  /** MCP server names */
  mcp?: string[];
  /** reasoning effort; unset means medium */
  effort?: Effort;
  /** false keeps every message; otherwise older turns are summarized near the context limit */
  compact?: boolean;
};

export const EFFORTS = ["off", "low", "medium", "high", "xhigh", "max"] as const;
export type Effort = (typeof EFFORTS)[number];
/** A chat picker's change: another model or another thinking time (the conversation carries on). */
export type Tuning = { model: string } | { effort: Effort };
/** How long a model thinks, in ChatGPT's words. "medium" is the default. */
export const EFFORT_LABEL: Record<Effort, string> = { off: "Instant", low: "Light", medium: "Standard", high: "Extended", xhigh: "Heavy", max: "Max" };

/** A skill as written (SKILL.md's name, description and instructions). */
export type Skill = { name: string; description: string; instructions: string };
/**
 * A skill an agent uses: from the skills.sh directory (`source`: its owner/repo/skill id, `programs`: scripts it
 * brings, `hash`: the fingerprint of the files that were checked before adding it) or written by hand (`instructions`).
 */
export type AgentSkill = { name: string; description: string; source?: string; programs?: number; instructions?: string; hash?: string };
/** A skill found in the skills.sh directory. */
export type SkillResult = { id: string; name: string; source: string; installs: number };
/** A directory skill's contents, shown before it is added. */
export type SkillPreview = { id: string; name: string; hash: string; description: string; instructions: string; files: { path: string; size: number }[]; programs: number };
/** The board's notes in its computer: AGENTS.md, SOUL.md, USER.md, MEMORY.md and the recent daily notes. */
export type BoardNotes = { agents: string; soul: string; user: string; memory: string; days: { date: string; text: string }[] };

export type McpServerInfo = {
  name: string; url?: string; command?: string; headerNames: string[];
  connected: boolean; error?: string; tools: { name: string; label: string; description: string }[];
};

/** A known app in the "Add an app" catalog. */
export type CatalogApp = {
  slug: string; name: string; category: string; url: string; auth: "API key" | "OAuth or API key" | "None";
  summary: string; docs: string; icon?: { path: string; hex: string };
};

export type SandboxInfo = { sandboxed: boolean; on: "local" | "cloud" };

export type ChatGPTStatus = { signedIn: boolean; email?: string; pending?: boolean; error?: string; revoked?: boolean };

// ---- Board ----

/** The board's built-in assistant (server/app/leo.ts): not one of the user's agents. `LEO_MODEL`: its model until one is chosen. */
export const LEO = "leo", LEO_MODEL = "openai/gpt-6-luna";
/** The built-in agent behind a board's nightly "Tidy this board's memory" card (server/app/notes.ts). */
export const MEMORY_KEEPER = "memory-keeper";

export type TaskStatus = "todo" | "running" | "done" | "error";
export type TaskCard = {
  id: string; num: number; kind: "task";
  title: string; notes: string;
  /** the agent of the latest run; `agents`: every agent that has worked on it (one tab each) */
  agent?: string; agents?: string[]; status: TaskStatus; result?: string; ranAt?: number;
  /** runs the card again on a repeat; `nextRunAt` (server-owned) is when, unless paused */
  schedule?: Schedule; nextRunAt?: number;
  /** recent runs, newest last (server-owned); `failStreak`: scheduled runs that failed in a row */
  runs?: TaskRun[]; failStreak?: number;
  /** the board's custom fields on this card: field id -> value */
  values?: Record<string, string>;
  /** where it came from, server-owned: a GitHub item (`github:owner/repo#12`), or "welcome" for a new board's how-tos */
  source?: string;
};
export type Card = TaskCard;
/** Every agent that has worked on a task (cards from before `agents` existed have just `agent`). */
export const taskAgents = (c: TaskCard) => c.agents ?? (c.agent ? [c.agent] : []);
/** How a run started: by hand, by its schedule, or by being added to a list with an agent. */
export type TaskRun = { at: number; agent: string; how: "manual" | "schedule" | "added"; status: "done" | "error" | "skipped"; note?: string };
/** `agent`: when a card is added to this list, that agent works on it. */
export type List = {
  id: string; title: string; cards: string[]; agent?: string; /** an icon name from shared/icons.ts */ icon?: string;
  /** shows the results of this GitHub search (server/infra/github.ts) instead of its own cards */
  source?: ListSource;
};
export type ListSource = { kind: "github"; query: string };
/** One GitHub search result in a synced list. `key` is stamped on a card made from it. */
export type GithubRow = { key: string; ref: string; title: string; url: string; /** open, draft, merged, closed, done, or a project's own Status */ status: string; by?: string };
export type Board = {
  title: string; lists: List[]; cards: Record<string, Card>; nextNum: number;
  /** custom fields every card has */
  fields?: Field[];
  /** bumped on every layout change; a save from an older copy is refused (an agent may have changed the board) */
  rev?: number;
  /** sandbox name of the board's computer */
  computer?: string;
};
export type BoardInfo = { id: string; title: string };
export type ComputerInfo = { state: "off" | "starting" | "running" | "error"; name: string; error?: string };

// ---- Chat (message parts, shared by the SSE stream, history and the UI) ----

export type ToolPart = {
  type: "dynamic-tool";
  toolCallId: string;
  toolName: string;
  input: unknown;
  state: "input-available" | "output-available" | "output-error";
  output?: string;
  image?: string; // data: URL screenshot from computer use
};
export type FilePart = { type: "file"; url: string; mediaType: string };
export type Part = { type: "text"; text: string } | { type: "reasoning"; text: string } | ToolPart | FilePart;
export type Message = { id: string; role: "user" | "assistant"; parts: Part[]; startedAt?: number; endedAt?: number; kind?: "summary" };

// ---- Wallpapers (Unsplash) ----

export type Wallpaper = {
  id: string;
  thumb: string; // small, for the picker
  url: string; // full-screen size
  color: string; // average colour (hex), shown while the image loads
  author: string;
  authorUrl: string; // with Unsplash utm params (attribution)
  photoUrl: string;
  downloadLocation: string; // ping when chosen (Unsplash API guideline)
};
/** `builtIn`: no Unsplash key, so these come from the built-in list (server/core/wallpapers.json). */
export type WallpaperResults = { enabled: boolean; photos: Wallpaper[]; builtIn?: boolean };

/** The name to show for an agent. */
export const agentLabel = (a: Pick<AgentDef, "name" | "title">) => a.title || a.name;
