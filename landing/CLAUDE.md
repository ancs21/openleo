# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

The OpenLeo marketing site (home, Download, Changelog, Blog, Privacy, Terms), built with Astro and deployed as static files to a Cloudflare Worker (`landing/wrangler.jsonc`) at `https://leooi.com`. The repo-root `CLAUDE.md` still applies.

## Commands

Run from the repo root:

```sh
bun run landing         # astro dev on port 3100
bun run landing:build   # static build into landing/dist
bun test landing        # tests (landing.test.tsx)
cd landing && bunx wrangler deploy   # deploy after a build: leooi.com and www (wrangler.jsonc)
```

- Astro runs under Bun (`bun --bun astro`). Under Node the prerender fails on `@atlaskit/pragmatic-drag-and-drop`'s directory imports.
- Run Astro from inside `landing/` (the scripts `cd` there). `--root landing` breaks when Astro moves the dev server to the background.
- Astro 7 puts `astro dev` in the background when there's no terminal (as when an agent runs it): manage it with `cd landing && bunx astro dev stop|status|logs`.
- Use `http://127.0.0.1:3100`: `localhost` can reach another server listening on `[::1]:3100`.

## How it fits together

- `downloads.ts` lists the installers (the home button and the Download page). `pages/*.astro` are the routes; `Layout.astro` holds the shared `<head>` (fonts, theme script, canonical URL from `site`). `build.format: "file"` emits `changelog.html`/`privacy.html`/`terms.html`, which the pages link to as `./changelog`, `./privacy` and `./terms`.
- The home page is one React island, `Landing.tsx`, rendered with `client:only="react"`. Don't switch it to `client:load`: the app's modules read `matchMedia` and the theme when they load, and the server markup wouldn't match the browser (React hydration error #418).
- The pictures on the page are the **real app components** from `../web` (ListColumn, CardView, Leo's chat, CardSchedule…), not mockups. They read the board from the app's zustand stores, so `demo.ts` builds a story per kind of reader and `seed(story(id))` loads it into those stores before rendering. `Landing` seeds on its first render and again when the reader picks another story.
- Scenes: `TITLES` (ids and titles) plus `scenes(s)` (body and demo per scene) are zipped into one chapter list that drives both the sidebar and the sections. Per-story chapters are filtered there (e.g. the GitHub chapter only appears in the `tech` story).

## Gotchas

- **Tailwind**: `story.css` imports `../web/styles/theme.css` and declares `@source "../web"`. Without that `@source` Tailwind only scans `landing/`, and classes used only inside shared `web/` components are never generated.
- **Asset imports**: in Astro, importing an image (`.svg`, `.jpg`) gives an object, not a URL. Import images with `?url` (typed in `web/assets.d.ts`). `.mp4` imports are already URLs.
- **Older iPhones (Safari before iOS 16.4)** are supported through two fixes in `astro.config.mjs`. `noLookbehind` removes a regex lookbehind from the markdown package (a parse error there leaves the page blank). `oldSafariCss` rewrites Tailwind's `(width >= …)` media queries as `min-width` with Lightning CSS after the build. It has to run in `astro:build:done`: changing the CSS during the Vite bundle step makes Astro drop the stylesheet `<link>`.
- `landing.test.tsx` renders `Landing` with `renderToStaticMarkup` under Bun, with a `matchMedia` stub. It checks the chapter order per story, real component output, and that the CTAs point to the download (the latest release's Mac installer) and GitHub URLs.
