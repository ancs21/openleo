import { expect, test } from "bun:test";
import { tenantCredentials } from "./credentials";
import { listMcp, saveMcp } from "./mcp";
import { dataDir, inTenant } from "./tenant";
import { vaultDelete, vaultGet, vaultSet } from "./vault";

test("vault entries are per tenant", async () => {
  await vaultSet("aaaaaaaaaaaaaaaa", "k", "one");
  await vaultSet("bbbbbbbbbbbbbbbb", "k", "two");
  expect(await vaultGet("aaaaaaaaaaaaaaaa", "k")).toBe("one");
  expect(await vaultGet("bbbbbbbbbbbbbbbb", "k")).toBe("two");
  await vaultDelete("aaaaaaaaaaaaaaaa", "k");
  expect(await vaultGet("aaaaaaaaaaaaaaaa", "k")).toBeNull();
  expect(await vaultGet("bbbbbbbbbbbbbbbb", "k")).toBe("two");
});

test("an account's ChatGPT tokens are its own; other accounts never see this machine's pi logins", async () => {
  const a = tenantCredentials("cccccccccccccccc"), b = tenantCredentials("dddddddddddddddd");
  await a.modify("openai", async () => ({ type: "oauth", access: "A", refresh: "r", expires: 1 }) as any);
  expect(((await a.read("openai")) as any).access).toBe("A");
  expect(await b.read("openai")).toBeUndefined();
  for (const id of ["anthropic", "openai-codex", "github-copilot"]) expect(await b.read(id)).toBeUndefined(); // not the owner
  expect((await b.list()).length).toBe(0);
});

test("connected-app API keys go to the vault, never into mcp.json", () => inTenant("eeeeeeeeeeeeeeee", async () => {
  // An unreachable address: the save still records the app (with a connection error).
  const info = await saveMcp("crm", { url: "http://127.0.0.1:9/mcp", headers: { Authorization: "Bearer SECRET-123" } });
  expect(info.headerNames).toEqual(["Authorization"]);
  const onDisk = await Bun.file(`${dataDir()}/mcp.json`).text();
  expect(onDisk).not.toContain("SECRET-123");
  expect(await vaultGet("eeeeeeeeeeeeeeee", "mcp/crm")).toContain("SECRET-123");
  expect((await listMcp())[0]!.headerNames).toEqual(["Authorization"]);
}));

test("private files are owner-only and replaced whole", async () => {
  const { writePrivate } = await import("./private-file");
  const { HOME } = await import("./config");
  const { statSync, readdirSync } = await import("node:fs");
  const path = `${HOME}/private-test/secret.json`;
  await Promise.all([writePrivate(path, "one"), writePrivate(path, "two")]); // concurrent writes don't collide
  expect(["one", "two"]).toContain(await Bun.file(path).text());
  expect(statSync(path).mode & 0o777).toBe(0o600);
  expect(readdirSync(`${HOME}/private-test`)).toEqual(["secret.json"]); // no temp files left
});
