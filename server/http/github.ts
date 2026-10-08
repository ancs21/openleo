// GitHub: the account the board lists read through (a personal access token, kept in the vault), and a list's rows.
import { findList, getBoard } from "../app/boards";
import { addRowCard, connectGithub, disconnectGithub, githubAccount, githubListOf, githubRows, githubToken } from "../app/github";
import { startOrNote } from "../app/tasks";
import { githubProjects, githubRepos, syncList } from "../infra/github";
import { boardParam, safe } from "./guard";

export const githubRoutes = {
  "/api/github": {
    GET: async () => {
      const account = await githubAccount();
      return Response.json({ connected: !!account, login: account?.login });
    },
    PUT: safe(async (req) => {
      const login = await connectGithub(String(((await req.json()) as any).token ?? "").trim());
      return Response.json({ connected: true, login });
    }),
    DELETE: async () => { await disconnectGithub(); return Response.json({ connected: false }); },
  },
  "/api/github/repos": { GET: safe(async () => Response.json(await githubRepos(await githubToken())), 502) },
  "/api/github/projects": { GET: safe(async () => Response.json(await githubProjects(await githubToken())), 502) },
  "/api/boards/:board/lists/:list/github": {
    GET: safe((req: Bun.BunRequest<"/api/boards/:board/lists/:list/github">) => {
      const bid = boardParam(req.params.board);
      githubListOf(bid, req.params.list);
      return Response.json(githubRows(bid, req.params.list));
    }, 404),
  },
  "/api/boards/:board/lists/:list/github/sync": {
    POST: safe(async (req: Bun.BunRequest<"/api/boards/:board/lists/:list/github/sync">) => {
      const bid = boardParam(req.params.board);
      const list = githubListOf(bid, req.params.list);
      await syncList(bid, list.id, list.source, await githubToken());
      return Response.json(githubRows(bid, list.id));
    }, 502),
  },
  // Add a row as a card to another list (dropped at `index`, else at the top); that list's agent starts on it, as when a person adds a card there.
  "/api/boards/:board/lists/:list/github/cards": {
    POST: safe(async (req: Bun.BunRequest<"/api/boards/:board/lists/:list/github/cards">) => {
      const bid = boardParam(req.params.board);
      const { key, to, index } = (await req.json()) as any;
      const target = findList(bid, String(to ?? ""));
      if (target.source) throw new Error("add it to a list of cards");
      const card = addRowCard(bid, githubListOf(bid, req.params.list).id, String(key ?? ""), target.id, Number(index) || 0);
      if (target.agent) startOrNote(bid, card.id, target.agent, "added");
      return Response.json(getBoard(bid));
    }),
  },
};
