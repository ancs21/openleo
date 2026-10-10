// Model credentials per tenant, in its vault entry "pi/<provider>". Only the install owner also gets this
// machine's pi CLI logins (~/.pi/agent/auth.json).
import type { Credential, CredentialStore } from "@earendil-works/pi-ai";
import { writePrivate } from "./private-file";
import { isOwner } from "./tenant";
import { vaultDelete, vaultGet, vaultSet } from "./vault";

// pi CLI logins (`pi` -> /login). In-process write lock only; a concurrent `pi` CLI refresh can race.
const AUTH = `${process.env.HOME}/.pi/agent/auth.json`;
const readAuth = async (): Promise<Record<string, Credential>> => ((await Bun.file(AUTH).exists()) ? Bun.file(AUTH).json() : {});
const writeAuth = (all: object) => writePrivate(AUTH, JSON.stringify(all, null, 2));
const serialized = () => {
  let lock = Promise.resolve<unknown>(undefined);
  return <T>(fn: () => Promise<T>) => (lock = lock.then(fn, fn)) as Promise<T>;
};
const serial = serialized();

export const piAuth: CredentialStore = {
  read: async (id) => (await readAuth())[id],
  list: async () => Object.entries(await readAuth()).map(([providerId, c]) => ({ providerId, type: c.type })),
  modify: (id, fn) => serial(async () => {
    const all = await readAuth();
    const next = await fn(all[id]);
    if (next) await writeAuth({ ...all, [id]: next });
    return next ?? all[id];
  }),
  delete: (id) => serial(async () => {
    const { [id]: _, ...rest } = await readAuth();
    await writeAuth(rest);
  }),
};

/** Providers a tenant keeps in its own vault (the vault has no listing). */
const OWN = ["openai"];

export function tenantCredentials(tenant: string): CredentialStore {
  const own = async (id: string) => {
    const raw = await vaultGet(tenant, `pi/${id}`);
    return raw ? (JSON.parse(raw) as Credential) : undefined;
  };
  const shared = isOwner(tenant);
  // Its own lock: modify may hand over to piAuth.modify, which takes piAuth's lock.
  const serial = serialized();
  const store: CredentialStore = {
    read: async (id) => (await own(id)) ?? (shared ? await piAuth.read(id) : undefined),
    list: async () => {
      const mine = (await Promise.all(OWN.map(async (id) => [id, await own(id)] as const)))
        .flatMap(([providerId, c]) => (c ? [{ providerId, type: c.type }] : []));
      const machine = shared ? (await piAuth.list()).filter((c) => !mine.some((m) => m.providerId === c.providerId)) : [];
      return [...mine, ...machine];
    },
    // Token refreshes write back to wherever the login lives.
    modify: (id, fn) => serial(async () => {
      const cur = await own(id);
      if (!cur && shared && (await piAuth.read(id))) return piAuth.modify(id, fn);
      const next = await fn(cur);
      if (next) await vaultSet(tenant, `pi/${id}`, JSON.stringify(next));
      return next ?? cur;
    }),
    delete: (id) => vaultDelete(tenant, `pi/${id}`),
  };
  return store;
}
