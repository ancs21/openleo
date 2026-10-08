# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

The OpenLeo app (React, Zustand, React Router, Tailwind v4), bundled by Bun from `index.html`. The repo-root
`CLAUDE.md` still applies (layers, conventions). The landing site reuses these components, so a change here shows
there too.

## Where a change goes

- **A call to the server**: `lib/` or a store, through `api<T>(path, init)` and `json(body, method)` from
  `lib/api.ts`. `api` throws the server's `error` message, and a 401 sends the person to `/login?next=…`.
- **Shared UI** (used by more than one feature): `components/`. Components don't call the server.
- **A screen or panel**: `features/<area>/`. Features may use each other only one way (`web/layers.test.ts`).
- **Browser-only storage** (remembered widths, last board): `lib/storage.ts`, which survives blocked storage.
- **Mac-app-only behavior**: behind `inMacApp()` (`lib/computer-files.ts`); the web version must keep working.

## State

- `stores/app-store.ts`: app-wide data (the open board's agents, models, ChatGPT sign-in, global dialogs).
- `features/board/store.ts`: the open board. Moves use the pure functions in `features/board/model.ts`; edits
  apply at once and save with a debounced PUT (300 ms). The server owns card status, so the store polls every
  1.5 s while a card runs (30 s while any card has a schedule). A 409 means the board changed on the server
  (Leo, an agent): the store reloads it instead of overwriting.
- `stores/panels.ts`: side panel widths.

Routes (`router.tsx`): everything is under `/b/:boardId` (cards at `card/:num`, agents at `agents/...` in a side
panel); old `/card` and `/agents` links redirect.

## Look

Use the theme tokens from `styles/theme.css` (`bg-surface`, `bg-canvas`, `text-ink`, `text-ink-2`, `text-ink-3`,
`border-line`, `bg-accent`, `rounded-card`, `rounded-control`, `rounded-chip`, `shadow-card`…) and the shared
components (`Button`, `IconButton`, `Popover`/`MenuItem`, `Modal`, `Select`, `Switch`, `Icon` with `glyphs`,
`AgentIcon`) instead of new one-off sizes, colors or controls. Dark mode comes from the tokens.
