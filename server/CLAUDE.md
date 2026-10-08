# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

The OpenLeo server. The repo-root `CLAUDE.md` still applies (layers, tenants, boards and computers, settings).

## Where a change goes

- **A rule about boards, rows, wallpapers, chat history** (validation, limits on text, how data changes): `core/`,
  as a plain function on the data. Test it without a tenant or files.
- **Something a person or an agent does** (run a card, create an agent, sync a list): `app/`. Board changes go
  through `app/boards.ts`, which loads the board, applies the `core/board.ts` rule and saves it; changes made on
  the server (Leo, setup) bump the board's `rev` there.
- **Talking to the outside** (files, the vault, GitHub, Unsplash, the computer, models): `infra/`.
- **A new endpoint**: a route in the matching `http/<area>.ts` object (a new file's object is spread into
  `Bun.serve` in `main.ts`). Wrap handlers in `safe(handler, statusOnError)`, check board ids with `boardParam`,
  and type the request as `Bun.BunRequest<"/api/...">` (routes live outside `Bun.serve`, so nothing infers it).
  Routes that work signed out must be listed in `PUBLIC` in `http/guard.ts`.
- **A setting**: `infra/config.ts`, with a default. No new environment variables.

`bun test server/layers.test.ts` fails when an import crosses layers the wrong way, or when `core/` does I/O.

## Patterns

- Errors are thrown as `Error` with a sentence the person can act on; `safe()` turns them into `{ error }` JSON.
  `LimitError` becomes 429, `StaleBoard` 409 (the app reloads the board).
- Everything account-specific runs inside `inTenant(id, fn)`; everything that touches a board's computer inside
  `inBoard(bid, fn)`. Both use AsyncLocalStorage, so they follow async calls. Tests do the same:
  `inTenant("some-test", () => { ... })`.
- Functions that call an outside service take a `fetchImpl` parameter (default `fetch`) so tests pass a fake.
- Agent tools: `defineTool({ name, label, description, parameters: Type.Object(...), execute })` with TypeBox from
  `@earendil-works/pi-ai`, returning `{ content: [{ type: "text", text }], details: {} }`. Agents get their tools
  in `fromDef` (`app/live-agents.ts`); Leo's are in `app/leo.ts`, the computer's in `app/tools.ts`.
- State that must survive `bun --hot` reloads (the schedule timer, sign-ins under way) is kept on `globalThis`.
- Files with secrets are written through `infra/private-file.ts` (owner-only) or the vault, never plain `Bun.write`.
- A run that nobody waits for (schedule, a card added to a list) uses `startOrNote`, so a failure to start is
  written on the card instead of thrown.
