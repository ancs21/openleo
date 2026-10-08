import { expect, test } from "bun:test";
import { pickRuntime, shq } from "./sandbox";

test("shq: hostile strings reach the shell as one literal argument", async () => {
  for (const s of ["a b", "$(touch /tmp/pwned)", "`id`", "it's", "'; echo x; '", "--help", ""]) {
    const out = await Bun.$`/bin/sh -c ${`printf %s ${shq(s)}`}`.text();
    expect(out).toBe(s);
  }
});

test("computers run where set, else natively on a Mac that can, else in Docker", () => {
  expect(pickRuntime(undefined, () => true)).toBe("apple");
  expect(pickRuntime(undefined, () => false)).toBe("local");
  expect(pickRuntime("local", () => true)).toBe("local"); // Docker on purpose
  expect(pickRuntime("cloud", () => true)).toBe("cloud");
  expect(pickRuntime("nonsense", () => false)).toBe("local");
});
