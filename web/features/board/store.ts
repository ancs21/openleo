// Edits apply optimistically and save debounced; the server owns task status, so we poll while anything runs.
import { create } from "zustand";

import type { Board, BoardInfo, Card, ComputerInfo, List, ListSource, TaskCard } from "../../../shared/types";
import type { Schedule } from "../../../shared/schedule";
import type { Field } from "../../../shared/fields";
import { play } from "../../lib/sounds";
import { storage } from "../../lib/storage";
import { useApp } from "../../stores/app-store";
import { moveCard, moveList, type DropResult } from "./model";

export type { Board, Card, List, TaskCard };

export type DragState = { kind: "card" | "list"; id: string; height: number; width: number; over: DropResult | null };

const newId = () => crypto.randomUUID().slice(0, 8);
let saveTimer: ReturnType<typeof setTimeout> | undefined;
let pollTimer: ReturnType<typeof setTimeout> | undefined;
let computerTimer: ReturnType<typeof setTimeout> | undefined;

export const MAIN_BOARD = "main";
/** The board "/" opens: the last one you were on (per browser). */
export const lastBoard = () => storage.get("board") || MAIN_BOARD;

async function call<T = Board>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, { headers: { "content-type": "application/json" }, ...init });
  const j = await r.json();
  if (!r.ok) throw Object.assign(new Error(j.error ?? `HTTP ${r.status}`), { status: r.status });
  return j;
}

type State = {
  boardId: string;
  boards: BoardInfo[];
  computer?: ComputerInfo;
  board?: Board;
  error?: string;
  drag?: DragState;
  setDrag: (drag?: DragState) => void;
  /** Saves any pending edit to the previous board first. */
  open: (boardId: string) => Promise<void>;
  load: () => Promise<void>;
  loadBoards: () => Promise<void>;
  createBoard: (title: string) => Promise<BoardInfo>;
  renameBoard: (title: string) => Promise<void>;
  deleteBoard: () => Promise<void>;
  loadComputer: () => Promise<void>;
  startComputer: () => Promise<void>;
  moveCard: (cardId: string, toListId: string, toIndex: number) => void;
  moveList: (listId: string, toIndex: number) => void;
  addList: (title: string) => void;
  renameList: (listId: string, title: string) => void;
  deleteList: (listId: string) => void;
  addTask: (listId: string, title: string) => void;
  editTask: (cardId: string, patch: { title?: string; notes?: string; schedule?: Schedule }) => void;
  /** When a card is added to this list, `agent` works on it (undefined: nobody). */
  setListAgent: (listId: string, agent?: string) => void;
  /** Make a GitHub list's row a card in another list, at `index` (its agent starts on it). */
  addRow: (fromList: string, key: string, toList: string, index?: number) => Promise<void>;
  /** Show a GitHub search in this list instead of its cards (undefined: back to cards). */
  setListSource: (listId: string, source?: ListSource) => void;
  /** Side panels' widths in px (dragged by their edge; per browser). */
  /** Lists whose icon is being picked from their title (shown as a placeholder meanwhile). */
  pickingIcons: string[];
  /** The list whose Automation window is open (its card-added rule and its cards' schedules). */
  automationList?: string;
  setAutomationList: (listId?: string) => void;
  deleteCard: (cardId: string) => void;
  setupBoard: (text: string) => Promise<{ lists: string[]; fields: string[] }>;
  setFields: (fields: Field[]) => Promise<void>;
  /** Set one card's value for a field ("" clears it). */
  setValue: (cardId: string, fieldId: string, value: string) => Promise<void>;
  run: (cardId: string, agent: string) => Promise<void>;
};

export const useBoard = create<State>((set, get) => {
  const base = () => `/api/boards/${get().boardId}`;
  const asked = new Set<string>(); // lists whose icon was already asked for this session
  /** A small model picks the list's icon from its title; it's kept only if the title is still the same. */
  const pickListIcon = async (listId: string, title: string) => {
    set({ pickingIcons: [...get().pickingIcons, listId] });
    const { icon } = await call<{ icon: string | null }>("/api/icon", { method: "POST", body: JSON.stringify({ text: title }) }).catch(() => ({ icon: null }));
    set({ pickingIcons: get().pickingIcons.filter((id) => id !== listId) });
    if (!icon) return;
    edit((b) => { const l = b.lists.find((x) => x.id === listId); if (l?.title === title) l.icon = icon; return b; });
  };
  /** Take the server's fields and values (they're server-owned) without dropping a local edit that's still to be saved. */
  const adopt = (server: Board) => {
    const local = get().board;
    if (!saveTimer || !local) return set({ board: server, error: undefined });
    const cards = Object.fromEntries(Object.entries(local.cards).map(([id, c]) => [id, { ...c, values: server.cards[id]?.values }]));
    set({ board: { ...local, fields: server.fields, cards }, error: undefined });
  };
  /** Lists without an icon (made before icons, or by Leo or a chat setup) get one, once per session. */
  const pickMissingIcons = (board: Board) => {
    for (const l of board.lists) if (!l.icon && !asked.has(l.id)) { asked.add(l.id); void pickListIcon(l.id, l.title); }
  };
  const save = async () => {
    saveTimer = undefined;
    try {
      const board = await call<Board>(base(), { method: "PUT", body: JSON.stringify(get().board) });
      if (!saveTimer) set({ board, error: undefined });
      else set({ board: { ...get().board!, rev: board.rev } }); // a change made meanwhile is still to be saved: keep it, on the new revision
    } catch (e) {
      // Changed on the server meanwhile (Leo, another window): take that, rather than overwrite it.
      if ((e as { status?: number }).status === 409) { clearTimeout(saveTimer); saveTimer = undefined; return get().load(); }
      set({ error: (e as Error).message });
    }
  };
  const edit = (fn: (b: Board) => Board) => {
    const b = get().board;
    if (!b) return;
    set({ board: fn(structuredClone(b)) });
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => void save(), 300);
  };
  const schedulePoll = () => {
    clearTimeout(pollTimer);
    const cards = Object.values(get().board?.cards ?? {});
    // Quickly while something runs; every 30 s while a schedule may start a run on its own.
    if (cards.some((c) => c.status === "running")) pollTimer = setTimeout(() => void get().load(), 1500);
    else if (cards.some((c) => c.nextRunAt)) pollTimer = setTimeout(() => void get().load(), 30_000);
  };

  return {
    boardId: MAIN_BOARD,
    pickingIcons: [],
    boards: [],
    open: async (boardId) => {
      if (boardId === get().boardId && get().board) return;
      if (saveTimer) { clearTimeout(saveTimer); await save(); }
      clearTimeout(pollTimer);
      set({ boardId, board: undefined, computer: undefined, error: undefined });
      storage.set("board", boardId);
      void useApp.getState().loadAgents(boardId).catch(() => {}); // agents belong to the board
      await Promise.all([get().load(), get().loadComputer()]);
    },
    loadBoards: async () => {
      try { set({ boards: await call<BoardInfo[]>("/api/boards") }); } catch (e) { set({ error: (e as Error).message }); }
    },
    createBoard: async (title) => {
      const info = await call<BoardInfo>("/api/boards", { method: "POST", body: JSON.stringify({ title }) });
      await get().loadBoards();
      return info;
    },
    renameBoard: async (title) => {
      try { set({ boards: await call<BoardInfo[]>(base(), { method: "PATCH", body: JSON.stringify({ title }) }) }); await get().load(); }
      catch (e) { set({ error: (e as Error).message }); }
    },
    deleteBoard: async () => {
      set({ boards: await call<BoardInfo[]>(base(), { method: "DELETE" }), board: undefined });
    },
    loadComputer: async () => {
      clearTimeout(computerTimer);
      const boardId = get().boardId;
      const computer = await call<ComputerInfo>(`${base()}/computer`).catch(() => undefined);
      if (boardId !== get().boardId) return; // switched boards meanwhile
      set({ computer });
      if (computer?.state === "starting") computerTimer = setTimeout(() => void get().loadComputer(), 2000);
    },
    startComputer: async () => {
      set({ computer: { ...(get().computer ?? { name: "" }), state: "starting", error: undefined } });
      const computer = await call<ComputerInfo>(`${base()}/computer`, { method: "POST" }).catch((e) => ({ state: "error" as const, name: "", error: (e as Error).message }));
      set({ computer });
    },
    load: async () => {
      const boardId = get().boardId;
      try {
        const board = await call(base());
        if (boardId !== get().boardId) return; // switched boards meanwhile
        // A task that was running here finished: chime (an error gets the softer "release" sound).
        const before = get().board?.cards ?? {};
        const finished = Object.values(board.cards).filter((c) => before[c.id]?.status === "running" && c.status !== "running");
        if (finished.length) play(finished.some((c) => c.status === "error") ? "release" : "page");
        if (!saveTimer || !get().board) set({ board, error: undefined }); // don't clobber an unsaved local edit
        pickMissingIcons(board);
        schedulePoll();
      } catch (e) { set({ error: (e as Error).message }); }
    },
    setDrag: (drag) => set({ drag }),
    moveCard: (cardId, toListId, toIndex) => edit((b) => moveCard(b, cardId, toListId, toIndex)),
    moveList: (listId, toIndex) => edit((b) => moveList(b, listId, toIndex)),
    addList: (title) => {
      const id = newId();
      edit((b) => ({ ...b, lists: [...b.lists, { id, title, cards: [] }] }));
      void pickListIcon(id, title);
    },
    setAutomationList: (automationList) => set({ automationList }),
    addRow: async (fromList, key, toList, index = 0) => {
      try { await call(`${base()}/lists/${fromList}/github/cards`, { method: "POST", body: JSON.stringify({ key, to: toList, index }) }); }
      catch (e) { set({ error: (e as Error).message }); }
      await get().load();
    },
    setListSource: (listId, source) => edit((b) => { const l = b.lists.find((x) => x.id === listId); if (l) { if (source) l.source = source; else delete l.source; } return b; }),
    setListAgent: (listId, agent) => edit((b) => { const l = b.lists.find((x) => x.id === listId); if (l) { if (agent) l.agent = agent; else delete l.agent; } return b; }),
    renameList: (listId, title) => {
      const l = get().board?.lists.find((x) => x.id === listId);
      if (!l || l.title === title) return;
      edit((b) => { b.lists.find((x) => x.id === listId)!.title = title; return b; });
      void pickListIcon(listId, title);
    },
    deleteList: (listId) => edit((b) => {
      for (const c of b.lists.find((x) => x.id === listId)?.cards ?? []) delete b.cards[c];
      b.lists = b.lists.filter((x) => x.id !== listId);
      return b;
    }),
    addTask: (listId, title) => edit((b) => {
      const id = `t${newId()}`;
      b.cards[id] = { id, num: b.nextNum++, kind: "task", title, notes: "", status: "todo" };
      b.lists.find((l) => l.id === listId)?.cards.unshift(id);
      return b;
    }),
    editTask: (cardId, patch) => edit((b) => { const c = b.cards[cardId]; if (c?.kind === "task") Object.assign(c, patch); return b; }),
    deleteCard: (cardId) => edit((b) => {
      if (b.cards[cardId]?.kind !== "task") return b;
      delete b.cards[cardId];
      for (const l of b.lists) l.cards = l.cards.filter((c) => c !== cardId);
      return b;
    }),
    setupBoard: async (text) => {
      clearTimeout(saveTimer); // save pending edits first: the server adds to the board as it is
      saveTimer = undefined;
      await call(base(), { method: "PUT", body: JSON.stringify(get().board) });
      const { added, board } = await call<{ added: { lists: string[]; fields: string[] }; board: Board }>(`${base()}/setup`, { method: "POST", body: JSON.stringify({ text }) });
      set({ board, error: undefined });
      pickMissingIcons(board);
      return added;
    },
    setFields: async (fields) => {
      const b = get().board;
      if (b) set({ board: { ...b, fields } });
      try { adopt(await call(`${base()}/fields`, { method: "PUT", body: JSON.stringify({ fields }) })); }
      catch (e) { set({ error: (e as Error).message }); }
    },
    setValue: async (cardId, field, value) => {
      const b = get().board, c = b?.cards[cardId];
      if (b && c) set({ board: { ...b, cards: { ...b.cards, [cardId]: { ...c, values: { ...c.values, [field]: value } } } } });
      try { adopt(await call(`${base()}/cards/${cardId}/values`, { method: "PATCH", body: JSON.stringify({ field, value }) })); }
      catch (e) { set({ error: (e as Error).message }); void get().load(); }
    },
    run: async (cardId, agent) => {
      clearTimeout(saveTimer); // flush pending edits first so the server runs the latest title/notes
      saveTimer = undefined;
      try {
        await call(base(), { method: "PUT", body: JSON.stringify(get().board) });
        set({ board: await call(`${base()}/cards/${cardId}/run`, { method: "POST", body: JSON.stringify({ agent }) }), error: undefined });
        schedulePoll();
      } catch (e) { set({ error: (e as Error).message }); }
    },
  };
});
