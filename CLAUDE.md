# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

OpenLeo: AI agents on a board, no code. A person's to-do cards are picked up by agents that work on the board's own
Linux computer (a cua sandbox) and run on the person's ChatGPT plan. It ships as a web app and a desktop app (Electrobun: macOS arm64, Windows x64, Linux x64/arm64).

## Commands

Bun only (never node, npm, vite, jest, express, dotenv; Bun loads `.env` itself).

```bash
bun install
bun run dev                         # server + app on http://127.0.0.1:3000, hot reload (server/main.ts)
bun run start                       # production mode (NODE_ENV=production: React production build)
bun test                            # all tests
bun test server/app/boards.test.ts  # one file
bun test -t "welcome"               # tests whose name matches
bunx tsc --noEmit                   # typecheck (there is no linter)
bun run app:dev / app:build         # desktop app for this OS; output in artifacts/ (CI: .github/workflows/desktop.yml)
bun run release [version]           # notes in landing/changelog.json `next` -> a version (default 0.<month>.<day>) in it and electrobun.config.ts; merged to main, CI tags and releases it
bun run landing / landing:build     # landing site (Astro, landing/) -> landing/dist
bun run computer:build:apple        # the openleo-computer image for Apple's container runtime
```

`test/setup.ts` (preloaded by bunfig.toml) points `OPENLEO_HOME` at a temp folder, so tests never touch real data.
Run `bun test` and `bunx tsc --noEmit` before calling a change done.

## Server architecture (server/)

Onion layers, enforced by `server/layers.test.ts`:

- `core/`: rules on plain data, no I/O (no `node:` imports, `fetch`, `Bun.write`, `process.env`). Board rules
  (`core/board.ts`) take a `Board` object and mutate or return it.
- `app/`: use cases (may use core and infra). `app/boards.ts` loads a board from the store, applies a core rule,
  saves it; it is the one entry point for board changes and keeps the old bid-based API (`addCard(bid, …)`).
- `infra/`: files, vault, sign-in, computers, models, GitHub, Unsplash. Never imports app or http.
- `http/`: routes as plain objects (`boardRoutes`, `agentRoutes`, …) spread into `Bun.serve` in `main.ts`.
  `http/guard.ts` wraps every route except sign-in: session cookie, same-origin check, and `inTenant(...)`.

Key ideas that span files:

- **Tenants**: every ChatGPT account has its own folder `data/tenants/<id>/`. Requests run inside
  `inTenant` (AsyncLocalStorage) and every path goes through `dataDir()`; the first account is the owner (no limits).
- **Boards and computers**: each board has one always-on computer named in `infra/board-store.ts`. A run says which
  board it is in with `inBoard(bid, fn)`; agent tools then reach that board's computer (`infra/sandbox.ts`).
  Where computers run: Apple's runtime when the Mac can (`appleAvailable`), else Docker, or cua cloud.
- **Agents** are JSON definitions per board (`infra/agent-store.ts`). `app/live-agents.ts` turns one into a hooks
  function (`useModel`, `useTool`, `useContext`, `useSubagent` from `infra/runtime.ts`, on pi) and keeps one live
  agent per conversation, restored from disk. Leo (`app/leo.ts`) is the built-in board assistant with board tools
  instead of a computer; the memory keeper tidies board notes nightly.
- **Card runs** (`app/tasks.ts`): a card's agent works in conversation `task-<card id>`. Runs start by hand, from a
  card's schedule (checked every 30 s), or when a card lands in a list with an agent; each run is noted on the card.
- **Board revisions**: server-side changes bump `rev`; a save from the app with an older `rev` is refused
  (`StaleBoard`, 409) so it reloads instead of overwriting.
- **Notes, memory and skills** live in the board's computer (`app/notes.ts`, `app/skills.ts`), not on the host.
- **Secrets** (ChatGPT tokens, app keys, the GitHub token) go in the vault (`infra/vault.ts`, chmod 600), never to the page.
- **Settings** are all in `infra/config.ts`. Don't add new environment variables; a settings layer will replace them.
- The server listens on 127.0.0.1 only and refuses to listen on the network without HTTPS (`exposureProblem`).

## Web app (web/)

React + Zustand + React Router, bundled by Bun's HTML imports (`web/index.html`). Layers, enforced by
`web/layers.test.ts`: `lib/` (API, storage, helpers) <- `stores/` <- `components/` (shared UI) <- `features/`
(board, agents, chat, auth, sandbox) <- `layouts/`, `router.tsx`. Features may use each other but never in a loop;
shared pieces belong in `components/` or `lib/`. Server calls live in `lib/` and stores, not in components.
`shared/` holds types and pure helpers used by both server and web.

The landing site (`landing/`, Astro) renders the app's own components with demo data from `landing/demo.ts`.
The desktop app (`desktop/main.ts`) starts the compiled server (`scripts/build-server.ts`) with its data in the app's
data folder; Mac-only features must sit behind `inMacApp()` so the web version keeps working everywhere.

## Conventions

- UI copy is plain and short, for people who don't code. Use the theme tokens (`web/styles/theme.css`) and the
  shared components, no one-off sizes or colors. No lightning/zap/bolt icons and no robot icons.
- Comments explain the code only: no history of changes, no tool or product names other than OpenLeo's own.
- OpenLeo is for one person and their agents; don't add team or project-management features.
- Data lives in `data/` (git-ignored); never commit anything from it.
