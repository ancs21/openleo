// GitHub lists: API calls with a personal access token, rows cached in <tenant>/sources/<board>/<list>.json
// (never in the board). A list fetches only on Sync or when it has never synced.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import type { GithubRow, ListSource } from "../../shared/types";
import { MAX_ROWS, PROJECT, projectRowsOf, rowsOf } from "../core/github";
import { dataDir } from "./tenant";

/** Pressing Sync again within this only shows the saved rows (GitHub limits requests per hour). */
export const MIN_SYNC_GAP = 30_000;

const SEARCH = `query($q: String!, $first: Int!) {
  search(query: $q, type: ISSUE, first: $first) {
    nodes {
      __typename
      ... on Issue { number title url state repository { nameWithOwner } author { login } }
      ... on PullRequest { number title url state isDraft repository { nameWithOwner } author { login } }
    }
  }
}`;

async function graphql(query: string, variables: object, token: string, fetchImpl: typeof fetch): Promise<any> {
  const res = await fetchImpl("https://api.github.com/graphql", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", "user-agent": "OpenLeo" },
    body: JSON.stringify({ query, variables }),
  }).catch(() => null);
  if (!res) throw new Error("Can't reach GitHub");
  if (res.status === 401) throw new Error("GitHub token expired: connect again");
  if (res.status === 403 || res.status === 429) throw new Error("GitHub limit reached: try later");
  if (!res.ok) throw new Error(`GitHub answered ${res.status}`);
  const json: any = await res.json();
  if (json?.errors?.length) {
    const message = String(json.errors[0]?.message ?? "");
    // Projects need their own permission on the token, which a token made for repos often lacks.
    if (/scope|project/i.test(message) && !json.data) throw new Error("This token can't read projects: give it Projects read access, then connect again");
    throw new Error(`GitHub couldn't run that: ${message.slice(0, 200)}`);
  }
  return json;
}

export async function fetchRows(query: string, token: string, fetchImpl: typeof fetch = fetch): Promise<GithubRow[]> {
  const project = PROJECT.exec(query.trim());
  if (project) return projectRowsOf(await graphql(PROJECT_ITEMS, { login: project[1], number: Number(project[2]), first: MAX_ROWS }, token, fetchImpl));
  return rowsOf(await graphql(SEARCH, { q: query, first: MAX_ROWS }, token, fetchImpl));
}

const ITEM_FIELDS = "number title url state repository { nameWithOwner } author { login }";
const PROJECT_ITEMS = `query($login: String!, $number: Int!, $first: Int!) {
  owner: repositoryOwner(login: $login) {
    ... on ProjectV2Owner {
      projectV2(number: $number) {
        url
        items(first: $first, orderBy: { field: POSITION, direction: ASC }) {
          nodes {
            id
            status: fieldValueByName(name: "Status") { ... on ProjectV2ItemFieldSingleSelectValue { name } }
            content { __typename ... on Issue { ${ITEM_FIELDS} } ... on PullRequest { ${ITEM_FIELDS} } ... on DraftIssue { title } }
          }
        }
      }
    }
  }
}`;

/** The projects a token can read, the user's own and their organizations', as `owner/number` ids. */
export async function githubProjects(token: string, fetchImpl: typeof fetch = fetch): Promise<{ id: string; title: string }[]> {
  const json = await graphql(`{ viewer { login projectsV2(first: 50) { nodes { number title } }
    organizations(first: 20) { nodes { login projectsV2(first: 20) { nodes { number title } } } } } }`, {}, token, fetchImpl);
  const v = json?.data?.viewer;
  const of = (login: string, nodes: any[] = []) => nodes.flatMap((p) => (typeof p?.number === "number" ? [{ id: `${login}/${p.number}`, title: String(p.title ?? "") }] : []));
  return [...of(v?.login, v?.projectsV2?.nodes), ...(v?.organizations?.nodes ?? []).flatMap((o: any) => of(o?.login, o?.projectsV2?.nodes))];
}

export async function githubLogin(token: string, fetchImpl: typeof fetch = fetch): Promise<string> {
  const res = await fetchImpl("https://api.github.com/user", { headers: { authorization: `Bearer ${token}`, "user-agent": "OpenLeo" } }).catch(() => null);
  if (!res) throw new Error("Can't reach GitHub");
  if (!res.ok) throw new Error("Token not accepted");
  return String(((await res.json()) as any).login ?? "");
}

export async function githubRepos(token: string, fetchImpl: typeof fetch = fetch): Promise<string[]> {
  const res = await fetchImpl("https://api.github.com/user/repos?per_page=100&sort=pushed", { headers: { authorization: `Bearer ${token}`, "user-agent": "OpenLeo" } }).catch(() => null);
  if (!res?.ok) throw new Error(res?.status === 401 ? "GitHub token expired: connect again" : "Can't reach GitHub");
  const list = (await res.json()) as { full_name?: unknown }[];
  return list.flatMap((r) => (typeof r.full_name === "string" ? [r.full_name] : []));
}

type Cache = { rows: GithubRow[]; syncedAt: number; query: string };
const dir = (bid: string) => `${dataDir("sources")}/${bid}`;
const cacheFile = (bid: string, listId: string) => `${dir(bid)}/${listId.replace(/[^\w-]/g, "")}.json`;

export function readRows(bid: string, listId: string): Cache | undefined {
  const f = cacheFile(bid, listId);
  return existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : undefined;
}

/** Skips the fetch if the same query synced within MIN_SYNC_GAP. On a failure the saved rows stay. */
export async function syncList(bid: string, listId: string, source: ListSource, token: string, now = Date.now(), fetchImpl: typeof fetch = fetch): Promise<Cache> {
  const cache = readRows(bid, listId);
  const gap = cache ? now - cache.syncedAt : Infinity;
  if (cache && cache.query === source.query && gap >= 0 && gap < MIN_SYNC_GAP) return cache;
  const next = { rows: await fetchRows(source.query, token, fetchImpl), syncedAt: now, query: source.query };
  mkdirSync(dir(bid), { recursive: true });
  writeFileSync(cacheFile(bid, listId), JSON.stringify(next));
  return next;
}

export const forgetBoardRows = (bid: string) => rmSync(dir(bid), { recursive: true, force: true });
