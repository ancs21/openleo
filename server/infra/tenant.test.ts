import { expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { currentTenant, dataDir, inTenant, moveOldData, tenantId } from "./tenant";
import { HOME } from "./config";

test("tenant ids are stable, folder-safe hashes of the ChatGPT subject", () => {
  expect(tenantId("user-abc")).toBe(tenantId("user-abc"));
  expect(tenantId("user-abc")).not.toBe(tenantId("user-abd"));
  expect(tenantId("user-abc")).toMatch(/^[0-9a-f]{16}$/);
});

test("data paths need a tenant and stay inside it; async work keeps the tenant", async () => {
  expect(() => currentTenant()).toThrow("no tenant");
  const a = tenantId("a"), b = tenantId("b");
  await inTenant(a, async () => {
    await Bun.sleep(1);
    expect(dataDir("agents")).toBe(`${HOME}/tenants/${a}/agents`);
  });
  expect(inTenant(b, () => dataDir())).toBe(`${HOME}/tenants/${b}`);
});

test("the first account takes over data from before tenants; later ones start empty", () => {
  // A fresh process with an empty home, so no other test's tenants exist yet.
  const home = mkdtempSync(join(tmpdir(), "openleo-tenant-"));
  mkdirSync(`${home}/agents`);
  writeFileSync(`${home}/agents/writer.json`, "{}");
  writeFileSync(`${home}/board.json`, "{}");
  const run = Bun.spawnSync(["bun", "-e", `
    const { ensureTenant, tenantId } = await import(${JSON.stringify(import.meta.dir + "/tenant.ts")});
    console.log(JSON.stringify([ensureTenant(tenantId("owner")), ensureTenant(tenantId("owner")), ensureTenant(tenantId("someone-else"))]));
  `], { env: { ...process.env, OPENLEO_HOME: home } });
  expect(JSON.parse(run.stdout.toString())).toEqual([true, false, true]);
  const owner = `${home}/tenants/${tenantId("owner")}`;
  expect(existsSync(`${owner}/agents/writer.json`)).toBe(true);
  expect(existsSync(`${owner}/board.json`)).toBe(true);
  expect(existsSync(`${home}/agents`)).toBe(false);
  expect(existsSync(`${home}/tenants/${tenantId("someone-else")}/agents`)).toBe(false);
});

test("data next to the code moves into data/ once; a home chosen on purpose is left alone", () => {
  const dir = mkdtempSync(join(tmpdir(), "openleo-old-"));
  writeFileSync(`${dir}/vault.json`, "{}");
  writeFileSync(`${dir}/owner`, "abc");
  moveOldData(`${dir}/custom`, dir);
  expect(existsSync(`${dir}/vault.json`)).toBe(true); // not the default home: nothing moves
  const cwd = process.cwd();
  process.chdir(dir);
  try { moveOldData("data", "."); } finally { process.chdir(cwd); }
  expect(readFileSync(`${dir}/data/owner`, "utf8")).toBe("abc");
  expect(existsSync(`${dir}/vault.json`)).toBe(false);
});
