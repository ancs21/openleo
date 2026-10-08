// The server's layers, from the inside out: core -> app -> infra / http -> main.ts.
// core is plain rules (no files, network or computers); app may use infra; infra never reaches back into app;
// nothing below main imports http. Test files may cross layers.
import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = import.meta.dir;
const MAY_IMPORT: Record<string, string[]> = { core: ["core"], app: ["core", "app", "infra"], infra: ["core", "infra"], http: ["core", "app", "infra", "http"] };

function sources(layer: string): string[] {
  return readdirSync(join(ROOT, layer), { recursive: true, encoding: "utf8" })
    .filter((f) => /\.tsx?$/.test(f) && !f.endsWith(".test.ts"))
    .map((f) => join(layer, f));
}

/** The server layers a file imports from (paths inside server/). */
function layersImported(file: string) {
  const text = readFileSync(join(ROOT, file), "utf8");
  return [...text.matchAll(/(?:from|import)\s*\(?\s*"(\.{1,2}\/[^"]+)"/g)]
    .map((m) => join(file, "..", m[1]!))
    .filter((p) => !p.startsWith(".."))
    .map((p) => p.split("/")[0]!);
}

test("each layer imports only itself and the layers inside it", () => {
  const wrong: string[] = [];
  for (const [layer, allowed] of Object.entries(MAY_IMPORT)) {
    for (const file of sources(layer)) {
      for (const used of layersImported(file)) if (!allowed.includes(used)) wrong.push(`${file} imports ${used}/`);
    }
  }
  expect(wrong).toEqual([]);
});

test("core has no I/O: no files, network, processes or settings", () => {
  const io = /(from|import)\s*"node:|Bun\.(write|file|spawn|\$)|\bfetch\(|process\.env/;
  expect(sources("core").filter((f) => io.test(readFileSync(join(ROOT, f), "utf8")))).toEqual([]);
});
