import { expect, test } from "bun:test";
import changelog from "./changelog.json";

test("the app's version is the changelog's newest, and versions only go up", async () => {
  const config = await Bun.file(`${import.meta.dir}/../electrobun.config.ts`).text();
  const versions = changelog.releases.map((r) => r.version);
  expect(config.match(/version: "([^"]+)"/)?.[1]).toBe(versions[0]);
  const num = (v: string) => v.split(".").map(Number).reduce((n, part) => n * 1000 + part, 0);
  expect(versions.map(num)).toEqual(versions.map(num).toSorted((a, b) => b - a));
  expect(new Set(versions).size).toBe(versions.length);
});
