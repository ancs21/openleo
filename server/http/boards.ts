// Boards: the board itself, its fields and setup, its cards' values and runs, its notes and its nightly memory tidy.
import { addToBoard, createBoard, deleteBoard, getBoard, listBoards, putBoard, renameBoard, setCardValue, setFields, StaleBoard } from "../app/boards";
import { NOTES, deleteDay, readNotes, writeNote, type NoteKey } from "../app/notes";
import { draftSetup } from "../app/setup-board";
import { runAddedCards, runTask, setTidy } from "../app/tasks";
import { forgetBoardAgents } from "../infra/agent-store";
import { forgetBoardRows } from "../infra/github";
import { checkBoards } from "../infra/limits";
import { pauseComputer, sandbox } from "../infra/sandbox";
import { SANDBOXED } from "../infra/config";
import { boardParam, err, inComputer, safe } from "./guard";

export const boardRoutes = {
  "/api/boards": {
    GET: () => Response.json(listBoards()),
    POST: safe(async (req) => {
      checkBoards(listBoards().length);
      const info = createBoard(String(((await req.json()) as any).title ?? ""));
      if (SANDBOXED) sandbox(info.id).catch(() => {});
      return Response.json(info);
    }),
  },
  "/api/boards/:board": {
    GET: safe((req: Bun.BunRequest<"/api/boards/:board">) => Response.json(getBoard(boardParam(req.params.board))), 404),
    PUT: safe(async (req: Bun.BunRequest<"/api/boards/:board">) => {
      const bid = boardParam(req.params.board);
      const input = await req.json();
      const before = new Set(Object.keys(getBoard(bid).cards));
      try { putBoard(bid, input); } catch (e) { if (e instanceof StaleBoard) return err(e, 409); throw e; }
      runAddedCards(bid, before);
      return Response.json(getBoard(bid));
    }),
    PATCH: safe(async (req: Bun.BunRequest<"/api/boards/:board">) => {
      renameBoard(boardParam(req.params.board), String(((await req.json()) as any).title ?? ""));
      return Response.json(listBoards());
    }),
    // Pauses the board's computer; its files are kept.
    DELETE: safe(async (req: Bun.BunRequest<"/api/boards/:board">) => {
      const bid = boardParam(req.params.board);
      deleteBoard(bid);
      forgetBoardAgents(bid); // a board's agents and their chats go with it
      forgetBoardRows(bid);
      await pauseComputer(bid);
      return Response.json(listBoards());
    }),
  },
  // Fields are server-owned (an agent may fill them mid-run), so they change here, not in the board PUT.
  "/api/boards/:board/fields": {
    PUT: safe(async (req: Bun.BunRequest<"/api/boards/:board/fields">) => {
      const bid = boardParam(req.params.board);
      setFields(bid, ((await req.json()) as any).fields);
      return Response.json(getBoard(bid));
    }),
  },
  "/api/boards/:board/setup": {
    POST: safe(async (req: Bun.BunRequest<"/api/boards/:board/setup">) => {
      const bid = boardParam(req.params.board);
      const text = String(((await req.json()) as any).text ?? "").trim();
      if (!text) throw new Error("say what the board is for");
      const added = addToBoard(bid, await draftSetup(text, getBoard(bid)));
      return Response.json({ added, board: getBoard(bid) });
    }, 502),
  },
  "/api/boards/:board/cards/:id/values": {
    PATCH: safe(async (req: Bun.BunRequest<"/api/boards/:board/cards/:id/values">) => {
      const bid = boardParam(req.params.board);
      const { field, value } = (await req.json()) as any;
      setCardValue(bid, req.params.id, String(field), value);
      return Response.json(getBoard(bid));
    }),
  },
  "/api/boards/:board/cards/:id/run": {
    POST: safe(async (req: Bun.BunRequest<"/api/boards/:board/cards/:id/run">) => {
      const bid = boardParam(req.params.board);
      const { agent } = (await req.json()) as any;
      runTask(bid, req.params.id, String(agent));
      return Response.json(getBoard(bid));
    }),
  },
  "/api/boards/:board/tidy": {
    POST: safe(async (req: Bun.BunRequest<"/api/boards/:board/tidy">) => {
      const { on, zone } = (await req.json()) as any;
      setTidy(boardParam(req.params.board), !!on, zone);
      return Response.json({ on: !!on });
    }),
  },
  "/api/boards/:board/notes": {
    GET: safe((req: Bun.BunRequest<"/api/boards/:board/notes">) => inComputer(req.params.board, readNotes), 503),
  },
  "/api/boards/:board/notes/:note": {
    PUT: safe(async (req: Bun.BunRequest<"/api/boards/:board/notes/:note">) => {
      const key = req.params.note as NoteKey;
      if (!(key in NOTES)) throw new Error("unknown note");
      const text = String(((await req.json()) as any)?.text ?? "").slice(0, 100_000);
      return inComputer(req.params.board, async () => { await writeNote(key, text); return readNotes(); });
    }),
  },
  "/api/boards/:board/notes/days/:date": {
    DELETE: safe((req: Bun.BunRequest<"/api/boards/:board/notes/days/:date">) =>
      inComputer(req.params.board, async () => { await deleteDay(req.params.date); return readNotes(); })),
  },
};
