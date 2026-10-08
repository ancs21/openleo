// The landing page and its Privacy and Terms pages, built into a static site in landing/dist.
import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";
import { transform } from "lightningcss";
import { fileURLToPath } from "node:url";

// Safari before iOS 16.4 can't parse regex lookbehind, and one syntax error leaves the whole page blank. The chat's
// markdown links emails with a lookbehind that its own check (`previous(match, true)`) already covers, so drop it.
const noLookbehind = {
  name: "no-lookbehind",
  transform(code, id) {
    if (id.includes("mdast-util-gfm-autolink-literal")) return code.replace("/(?<=^|\\s|\\p{P}|\\p{S})(", "/(");
  },
};

// Safari before iOS 16.4 ignores `(width >= 64rem)` media queries, so phones got the desktop layout: once the site is
// built, rewrite its CSS as min-width/max-width.
const oldSafariCss = {
  name: "old-safari-css",
  hooks: {
    "astro:build:done": async ({ dir }) => {
      for await (const path of new Bun.Glob("**/*.css").scan(fileURLToPath(dir))) {
        const file = Bun.file(new URL(path, dir));
        const { code } = transform({ filename: path, code: Buffer.from(await file.text()), minify: true, targets: { safari: 15 << 16, ios_saf: 15 << 16 } });
        await Bun.write(file, code);
      }
    },
  },
};

export default defineConfig({
  site: "https://openleo.si",
  srcDir: ".",
  outDir: "dist",
  build: { format: "file" }, // privacy.html, terms.html: the pages link to ./privacy and ./terms
  integrations: [react(), oldSafariCss],
  devToolbar: { enabled: false },
  vite: { plugins: [tailwindcss(), noLookbehind] },
});
