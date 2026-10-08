// GitHub lists, the use cases: the account's token (kept in the vault), a list's rows, and a row turned into a card.
import { addCard, getBoard, updateTask } from "./boards";
import { githubLogin, readRows } from "../infra/github";
import { currentTenant } from "../infra/tenant";
import { vaultDelete, vaultGet, vaultSet } from "../infra/vault";

const GITHUB_TOKEN = "github/token";

/** The saved GitHub account, if any: its token and login. */
export async function githubAccount(): Promise<{ token: string; login: string } | undefined> {
  const saved = await vaultGet(currentTenant(), GITHUB_TOKEN);
  return saved ? JSON.parse(saved) : undefined;
}

/** The saved token, or an error asking to connect. */
export async function githubToken() {
  const account = await githubAccount();
  if (!account) throw new Error("connect GitHub first");
  return account.token;
}

/** Check a token with GitHub and save it. */
export async function connectGithub(token: string) {
  if (!/^[\w-]{20,255}$/.test(token)) throw new Error("that doesn't look like a GitHub token");
  const login = await githubLogin(token);
  await vaultSet(currentTenant(), GITHUB_TOKEN, JSON.stringify({ token, login }));
  return login;
}

export const disconnectGithub = () => vaultDelete(currentTenant(), GITHUB_TOKEN);

/** A list on the board that shows a GitHub search. */
export function githubListOf(bid: string, listId: string) {
  const list = getBoard(bid).lists.find((l) => l.id === listId);
  if (!list?.source) throw new Error("that list doesn't show GitHub items");
  return list as typeof list & { source: NonNullable<typeof list.source> };
}

/** What a GitHub list shows: its saved rows and when they synced. */
export function githubRows(bid: string, listId: string) {
  const cache = readRows(bid, listId);
  return { rows: cache?.rows ?? [], syncedAt: cache?.syncedAt ?? null };
}

/** Add one of a synced list's rows as a card in another list (at the top, or at `index` where it was dropped), marked with the row it came from. */
export function addRowCard(bid: string, fromList: string, key: string, toList: string, index = 0) {
  const row = readRows(bid, fromList)?.rows.find((r) => r.key === key);
  if (!row) throw new Error("Item gone: sync again");
  const card = addCard(bid, toList, row.title, `${row.url}\n\nGitHub ${row.ref} (${row.status}${row.by ? `, by ${row.by}` : ""})`);
  const list = getBoard(bid).lists.find((l) => l.id === toList)!;
  list.cards.splice(Math.min(Math.max(0, index), list.cards.length - 1), 0, list.cards.shift()!);
  return updateTask(bid, card.id, { source: row.key }); // saves the board
}
