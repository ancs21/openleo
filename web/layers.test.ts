// The web app's layers: lib (API, storage, helpers) <- stores (app state) <- components (shared UI) <- features
// (board, agents, chat…) <- layouts and the router. A feature may use another feature, but never in a loop.
import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = import.meta.dir;
const MAY_IMPORT: Record<string, string[]> = { lib: ["lib"], stores: ["lib", "stores"], components: ["lib", "stores", "components", "assets"] };

/** A file's area: lib, stores, components, features/<name>, layouts… */
const areaOf = (file: string) => (file.startsWith("features/") ? file.split("/").slice(0, 2).join("/") : file.split("/")[0]!);

function imports() {
  const edges: [string, string, string][] = []; // [file, its area, imported area]
  for (const file of readdirSync(ROOT, { recursive: true, encoding: "utf8" })) {
    if (!/\.tsx?$/.test(file) || /\.test\.tsx?$/.test(file)) continue;
    for (const m of readFileSync(join(ROOT, file), "utf8").matchAll(/(?:from|import)\s*\(?\s*"(\.{1,2}\/[^"]+)"/g)) {
      const target = join(file, "..", m[1]!);
      if (!target.startsWith("..")) edges.push([file, areaOf(file), areaOf(target)]);
    }
  }
  return edges;
}

test("lib, stores and components never reach up into features, layouts or the router", () => {
  const wrong = imports().filter(([, from, to]) => MAY_IMPORT[from] && !MAY_IMPORT[from]!.includes(to)).map(([file, , to]) => `${file} imports ${to}`);
  expect(wrong).toEqual([]);
});

test("features don't import each other in a loop", () => {
  const uses = new Map<string, Set<string>>();
  for (const [, from, to] of imports()) {
    if (from.startsWith("features/") && to.startsWith("features/") && from !== to) uses.set(from, (uses.get(from) ?? new Set()).add(to));
  }
  const loops: string[] = [];
  const walk = (at: string, path: string[]) => {
    if (path.includes(at)) return void loops.push([...path.slice(path.indexOf(at)), at].join(" -> "));
    for (const next of uses.get(at) ?? []) walk(next, [...path, at]);
  };
  for (const feature of uses.keys()) walk(feature, []);
  expect(loops).toEqual([]);
});
