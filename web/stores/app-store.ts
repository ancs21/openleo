// App-wide state: the board's agents, model catalog, tools, sandbox, ChatGPT sign-in, global dialogs.
import { create } from "zustand";
import type { AgentDef, ChatGPTStatus, McpServerInfo, SandboxInfo, Tuning } from "../../shared/types";
import { api, json } from "../lib/api";
import { openInNewTab } from "../lib/open-tab";
import { storage } from "../lib/storage";

type AppState = {
  agents: AgentDef[];
  agentsLoaded: boolean;
  agentsBoard: string;
  models: string[];
  mcp: McpServerInfo[];
  sandbox?: SandboxInfo;
  chatgpt: ChatGPTStatus;
  notice?: string;
  welcomeOpen: boolean;
  /** `setupNeeded`: this Mac has no working computer yet and its owner can set one up */
  setupOpen: boolean;
  setupNeeded: boolean;
  limitOpen: boolean;

  init: () => Promise<void>;
  /** Defaults to the board they were last loaded for. */
  loadAgents: (board?: string) => Promise<void>;
  loadModels: () => Promise<void>;
  loadChatGPT: () => Promise<ChatGPTStatus>;
  /** Skills are installed right away if the board's computer is on. */
  saveAgent: (def: AgentDef, previousName?: string) => Promise<{ installed: boolean; failed: string[] } | undefined>;
  deleteAgent: (name: string) => Promise<void>;
  tuneAgent: (name: string, patch: Tuning) => Promise<void>;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  openViewer: (board?: string) => Promise<void>;
  /** Connects right away; resolves with the server's tools or its connection error. */
  saveMcp: (name: string, cfg: { url?: string; headers?: Record<string, string>; command?: string }) => Promise<McpServerInfo>;
  deleteMcp: (name: string) => Promise<void>;
  setNotice: (notice?: string) => void;
  setWelcomeOpen: (open: boolean) => void;
  setSetup: (patch: { setupOpen?: boolean; setupNeeded?: boolean }) => void;
  setLimitOpen: (open: boolean) => void;
};

export const agentsUrl = (board: string) => `/api/boards/${board}/agents`;

export const useApp = create<AppState>((set, get) => ({
  agents: [],
  agentsLoaded: false,
  agentsBoard: "",
  models: [],
  mcp: [],
  chatgpt: { signedIn: false },
  welcomeOpen: false,
  setupOpen: false,
  setupNeeded: false,
  limitOpen: false,

  init: async () => {
    const { loadModels, loadChatGPT } = get();
    await Promise.all([
      loadModels(), loadChatGPT(),
      api<SandboxInfo>("/api/sandbox").then((sandbox) => set({ sandbox })),
      api<McpServerInfo[]>("/api/mcp").then((mcp) => set({ mcp })),
    ]).catch((e) => set({ notice: (e as Error).message }));
  },

  loadAgents: async (board = get().agentsBoard) => {
    if (!board) return;
    if (board !== get().agentsBoard) set({ agentsBoard: board, agents: [], agentsLoaded: false }); // never show another board's agents
    const agents = await api<AgentDef[]>(agentsUrl(board));
    if (get().agentsBoard === board) set({ agents, agentsLoaded: true }); // unless the user moved on to another board meanwhile
  },
  loadModels: async () => set({ models: await api<string[]>("/api/models") }),

  loadChatGPT: async () => {
    const status = await api<ChatGPTStatus>("/api/auth/chatgpt");
    const was = get().chatgpt.signedIn;
    if (status.signedIn && !was) {
      void get().loadModels();
      if (!storage.get("gpt-welcomed")) { storage.set("gpt-welcomed", "1"); set({ welcomeOpen: true }); }
    }
    set({ chatgpt: status });
    return status;
  },

  saveAgent: async (def, previousName) => {
    const base = agentsUrl(get().agentsBoard);
    await api(`${base}/${def.name}`, json(def, "PUT"));
    if (previousName && previousName !== def.name) await api(`${base}/${previousName}`, { method: "DELETE" });
    await get().loadAgents();
    if (def.skills?.length) return api<{ installed: boolean; failed: string[] }>(`${base}/${def.name}/skills`, { method: "POST" });
  },

  deleteAgent: async (name) => {
    await api(`${agentsUrl(get().agentsBoard)}/${name}`, { method: "DELETE" });
    await get().loadAgents();
  },

  // Model-only change: the server swaps it in place, so open conversations keep going.
  tuneAgent: async (name, patch) => {
    const saved = get().agents.find((a) => a.name === name);
    if (!saved) return;
    set({ agents: get().agents.map((a) => (a.name === name ? { ...a, ...patch } : a)) });
    try { await api(`${agentsUrl(get().agentsBoard)}/${name}`, json({ ...saved, ...patch }, "PUT")); }
    catch (e) { set({ notice: (e as Error).message }); await get().loadAgents(); }
  },

  signIn: async () => {
    try {
      await openInNewTab(async () => (await api<{ url: string }>("/api/auth/chatgpt/login", { method: "POST" })).url);
      set({ chatgpt: { ...get().chatgpt, pending: true, error: undefined } });
    } catch (e) {
      return set({ chatgpt: { ...get().chatgpt, error: (e as Error).message } });
    }
    // Background tabs throttle timers; RootLayout also re-checks on window focus.
    const started = Date.now();
    const poll = setInterval(async () => {
      const s = await get().loadChatGPT().catch(() => null);
      if (!s || s.signedIn || s.error || Date.now() - started > 600_000) clearInterval(poll);
    }, 1500);
  },

  signOut: async () => {
    const r = await api<ChatGPTStatus>("/api/auth/chatgpt/logout", { method: "POST" });
    location.assign(r.revoked ? "/login" : `/login?error=${encodeURIComponent("Signed out here, but ChatGPT didn't confirm it. Disconnect OpenLeo in ChatGPT settings to be sure.")}`);
  },

  openViewer: async (board = "main") => {
    try { await openInNewTab(async () => (await api<{ url: string }>(`/api/sandbox/viewer?board=${encodeURIComponent(board)}`, { method: "POST" })).url); }
    catch (e) { set({ notice: `Desktop view: ${(e as Error).message}` }); }
  },

  saveMcp: async (name, cfg) => {
    const info = await api<McpServerInfo>(`/api/mcp/${name}`, json(cfg, "PUT"));
    set({ mcp: [...get().mcp.filter((s) => s.name !== name), info] });
    return info;
  },
  deleteMcp: async (name) => {
    await api(`/api/mcp/${name}`, { method: "DELETE" });
    set({ mcp: get().mcp.filter((s) => s.name !== name) });
  },

  setNotice: (notice) => set({ notice }),
  setWelcomeOpen: (welcomeOpen) => set({ welcomeOpen }),
  setSetup: (patch) => set(patch),
  setLimitOpen: (limitOpen) => set({ limitOpen }),
}));

export const USAGE_URL = "https://chatgpt.com/settings/usage";
export const isPlanModel = (model: string, signedIn: boolean) => signedIn && model.startsWith("openai/");
