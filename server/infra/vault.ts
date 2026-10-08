// Vault: each tenant's secrets (ChatGPT tokens, connected-app API keys) live in <home>/vault.json, readable by
// the owner only (0600), keyed "<tenant>/<key>". Other data files never hold secrets.
import { writePrivate } from "./private-file";
import { HOME } from "./config";

const FILE = `${HOME}/vault.json`;

let lock = Promise.resolve<unknown>(undefined);
const serial = <T>(fn: () => Promise<T>) => (lock = lock.then(fn, fn)) as Promise<T>;
const readFile = async (): Promise<Record<string, string>> => ((await Bun.file(FILE).exists()) ? Bun.file(FILE).json() : {});
const writeFile = (all: Record<string, string>) => writePrivate(FILE, JSON.stringify(all, null, 2));

export const vaultGet = async (tenant: string, key: string): Promise<string | null> => (await readFile())[`${tenant}/${key}`] ?? null;

export const vaultSet = (tenant: string, key: string, value: string) =>
  serial(async () => writeFile({ ...(await readFile()), [`${tenant}/${key}`]: value }));

export const vaultDelete = (tenant: string, key: string) =>
  serial(async () => {
    const { [`${tenant}/${key}`]: _, ...rest } = await readFile();
    await writeFile(rest);
  });
