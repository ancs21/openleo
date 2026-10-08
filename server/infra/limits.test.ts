import { expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { checkBoards, checkRuns, computerSize, folderBytes, LimitError, unlimited } from "./limits";
import { HOME, LIMITS } from "./config";
import { dataDir, inTenant } from "./tenant";

const guest = "1111111111111111", owner = "2222222222222222";
writeFileSync(`${HOME}/owner`, owner); // this test home's owner

test("other accounts are held to the limits", () => inTenant(guest, () => {
  expect(unlimited()).toBe(false);
  expect(() => checkBoards(LIMITS.boards - 1)).not.toThrow();
  expect(() => checkBoards(LIMITS.boards)).toThrow(LimitError);
  expect(() => checkRuns(LIMITS.runs)).toThrow(/at once/);
  expect(computerSize()).toEqual({ cpus: LIMITS.computerCpus, memoryMb: BigInt(LIMITS.computerMemoryMb) });
}));

test("the owner (this machine's account) has none", () => inTenant(owner, () => {
  expect(unlimited()).toBe(true);
  expect(() => checkBoards(1000)).not.toThrow();
  expect(() => checkRuns(1000)).not.toThrow();
  expect(computerSize()).toEqual({});
}));

test("storage counts every file in the account's folder", () => inTenant(guest, () => {
  const dir = dataDir("measure");
  mkdirSync(`${dir}/deep/er`, { recursive: true });
  writeFileSync(`${dir}/a.txt`, "x".repeat(1000));
  writeFileSync(`${dir}/deep/er/b.txt`, "y".repeat(2500));
  expect(folderBytes(dir)).toBe(3500);
}));
