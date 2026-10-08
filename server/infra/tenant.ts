// Tenants: each ChatGPT account (one person) has its own data folder, tenants/<id>/, holding its agents,
// skills, connected apps, boards, conversations and host workspace. A signed-in request runs inside its
// tenant (inTenant), and every data path resolves through dataDir(), so one account never sees another's data.
import { AsyncLocalStorage } from "node:async_hooks";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";

import { HOME } from "./config";
const ROOT = `${HOME}/tenants`;
const scope = new AsyncLocalStorage<string>();

/** Data used to sit next to the code (the old default home, "."). Move it into the default home once, keeping the vault's permissions. */
export function moveOldData(home = HOME, from = ".") {
  if (home !== "data") return; // a home that was chosen on purpose is left alone
  for (const name of ["tenants", "owner", "sessions.json", "vault.json", "cache"]) {
    if (!existsSync(`${from}/${name}`) || existsSync(`${home}/${name}`)) continue;
    mkdirSync(home, { recursive: true });
    renameSync(`${from}/${name}`, `${home}/${name}`);
  }
}

/** Folder-safe id for an account: a hash of its account key, the verified email (which never appears on disk). */
export const tenantId = (account: string) => new Bun.CryptoHasher("sha256").update(account).digest("hex").slice(0, 16);

/** Run `fn` (and all async work it starts) as `tenant`. */
export const inTenant = <T>(tenant: string, fn: () => T) => scope.run(tenant, fn);

export function currentTenant() {
  const t = scope.getStore();
  if (!t) throw new Error("no tenant for this request");
  return t;
}

/** The current tenant's folder, or a folder inside it (created on first use). */
export function dataDir(sub = "") {
  const dir = sub ? `${ROOT}/${currentTenant()}/${sub}` : `${ROOT}/${currentTenant()}`;
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** A tenant's folder by id, outside of a request (sign-in, startup). */
export const tenantDir = (tenant: string) => `${ROOT}/${tenant}`;

export const listTenants = () => (existsSync(ROOT) ? readdirSync(ROOT).filter((t) => /^[0-9a-f]{16}$/.test(t)) : []);

/** The install's owner: the first account that signed in (it runs on this machine's own logins, too). */
const OWNER = `${HOME}/owner`;
export const ownerTenant = () => (existsSync(OWNER) ? readFileSync(OWNER, "utf8").trim() : undefined);
export const isOwner = (tenant: string) => ownerTenant() === tenant;

/** Data from before tenants existed; the first account to sign in takes it over. */
const LEGACY = ["agents", "skills", "boards", "board.json", "conversations", "workspace", "mcp.json"];

/** Create a tenant's folder on first sign-in. Returns true when it's new. The first one becomes the install's owner. */
export function ensureTenant(tenant: string) {
  const dir = `${ROOT}/${tenant}`;
  if (existsSync(dir)) return false;
  const first = listTenants().length === 0;
  mkdirSync(dir, { recursive: true });
  if (first) {
    for (const name of LEGACY) if (existsSync(`${HOME}/${name}`)) renameSync(`${HOME}/${name}`, `${dir}/${name}`);
    writeFileSync(OWNER, tenant);
  }
  return true;
}
