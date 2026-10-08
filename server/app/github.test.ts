import { expect, test } from "bun:test";
import { createBoard, getBoard, putBoard } from "./boards";
import { addRowCard } from "./github";
import { githubSource, projectRowsOf, rowsOf } from "../core/github";
import { githubProjects, githubRepos, readRows, syncList } from "../infra/github";
import { inTenant } from "../infra/tenant";

const PR = { __typename: "PullRequest", number: 7, title: "Fix login", url: "https://github.com/a/b/pull/7", state: "OPEN", isDraft: false, repository: { nameWithOwner: "a/b" }, author: { login: "octo" } };
const answer = (nodes: object[]) => Response.json({ data: { search: { nodes } } });

test("a list's GitHub source: a search query, nothing else", () => {
  expect(githubSource({ kind: "github", query: " repo:a/b is:pr ", site: "x" })).toEqual({ kind: "github", query: "repo:a/b is:pr" });
  expect(githubSource({ kind: "github", query: "  " })).toBeUndefined();
  expect(githubSource({ kind: "jira", query: "x" })).toBeUndefined();
});

test("search results become rows, in GitHub's own words", () => {
  const rows = rowsOf({ data: { search: { nodes: [
    PR,
    { ...PR, number: 8, state: "MERGED" },
    { ...PR, number: 9, state: "CLOSED" },
    { ...PR, number: 10, isDraft: true },
    { __typename: "Issue", number: 3, title: "Crash", url: "https://github.com/a/b/issues/3", state: "CLOSED", repository: { nameWithOwner: "a/b" }, author: null },
    { number: 4 }, // broken: left out
  ] } } });
  expect(rows.map((r) => `${r.ref} ${r.status}`)).toEqual(["a/b#7 open", "a/b#8 merged", "a/b#9 closed", "a/b#10 draft", "a/b#3 done"]);
  expect(rows[0]).toEqual({ key: "github:a/b#7", ref: "a/b#7", title: "Fix login", url: "https://github.com/a/b/pull/7", status: "open", by: "octo" });
});

test("a synced list fetches at most every 30 s, again when its query changes, and keeps its rows when GitHub fails", async () => {
  await inTenant("github-sync", async () => {
    const bid = createBoard("Dev").id;
    const list = getBoard(bid).lists[0]!;
    let calls = 0;
    const ok = (async () => (calls++, answer([PR]))) as unknown as typeof fetch;
    const source = { kind: "github" as const, query: "repo:a/b" };

    expect((await syncList(bid, list.id, source, "tok", 1000, ok)).rows).toHaveLength(1);
    await syncList(bid, list.id, source, "tok", 2000, ok);
    expect(calls).toBe(1); // too soon: the saved rows
    await syncList(bid, list.id, { ...source, query: "repo:c/d" }, "tok", 3000, ok);
    expect(calls).toBe(2); // a new question

    const down = (async () => new Response("", { status: 401 })) as unknown as typeof fetch;
    await expect(syncList(bid, list.id, source, "bad", 60_000, down)).rejects.toThrow(/token/i);
    expect(readRows(bid, list.id)?.rows).toHaveLength(1);
  });
});

test("a row becomes a card in another list, marked with where it came from", async () => {
  await inTenant("github-card", async () => {
    const bid = createBoard("Dev").id;
    const [synced, todo] = getBoard(bid).lists;
    await syncList(bid, synced!.id, { kind: "github", query: "repo:a/b" }, "tok", 1000, (async () => answer([PR])) as unknown as typeof fetch);

    const card = addRowCard(bid, synced!.id, "github:a/b#7", todo!.id);
    expect(card).toMatchObject({ title: "Fix login", source: "github:a/b#7" });
    expect(card.notes).toContain("https://github.com/a/b/pull/7");
    expect(getBoard(bid).lists[1]!.cards[0]).toBe(card.id);
    expect(() => addRowCard(bid, synced!.id, "github:a/b#99", todo!.id)).toThrow(/sync/);
    const dropped = addRowCard(bid, synced!.id, "github:a/b#7", todo!.id, 1); // dragged in below the first card
    expect(getBoard(bid).lists[1]!.cards).toEqual([card.id, dropped.id]);

    // The app saves the board: the list keeps its source, the card its mark (which the app can't set).
    const b = getBoard(bid);
    putBoard(bid, { ...b, lists: b.lists.map((l, i) => (i ? l : { ...l, source: { kind: "github", query: "repo:a/b" } })), cards: { ...b.cards, [card.id]: { ...card, source: "github:x/y#1" } } });
    expect(getBoard(bid).lists[0]!.source).toEqual({ kind: "github", query: "repo:a/b" });
    expect(getBoard(bid).cards[card.id]!.source).toBe("github:a/b#7");
  });
});

test("the repos a token can read, to pick from", async () => {
  const repos = (async () => Response.json([{ full_name: "me/app" }, { full_name: "org/site" }, {}])) as unknown as typeof fetch;
  expect(await githubRepos("tok", repos)).toEqual(["me/app", "org/site"]);
  await expect(githubRepos("bad", (async () => new Response("", { status: 401 })) as unknown as typeof fetch)).rejects.toThrow(/connect again/);
});

test("a project's items become rows, in the project's own Status words", () => {
  const rows = projectRowsOf({ data: { owner: { projectV2: { url: "https://github.com/users/me/projects/3", items: { nodes: [
    { id: "I1", status: { name: "In Progress" }, content: { __typename: "Issue", number: 5, title: "Crash", url: "https://github.com/me/app/issues/5", repository: { nameWithOwner: "me/app" }, author: { login: "me" } } },
    { id: "I2", status: null, content: { __typename: "DraftIssue", title: "Idea" } },
    { id: "I3", content: null }, // no access: left out
  ] } } } } });
  expect(rows).toEqual([
    { key: "github:me/app#5", ref: "me/app#5", title: "Crash", url: "https://github.com/me/app/issues/5", status: "In Progress", by: "me" },
    { key: "github:project-item:I2", ref: "Draft", title: "Idea", url: "https://github.com/users/me/projects/3", status: "No status" },
  ]);
});

test("the projects a token can read: its own and its organizations'", async () => {
  const answer = (async () => Response.json({ data: { viewer: { login: "me", projectsV2: { nodes: [{ number: 3, title: "Roadmap" }] },
    organizations: { nodes: [{ login: "acme", projectsV2: { nodes: [{ number: 1, title: "Sprint" }] } }] } } } })) as unknown as typeof fetch;
  expect(await githubProjects("tok", answer)).toEqual([{ id: "me/3", title: "Roadmap" }, { id: "acme/1", title: "Sprint" }]);
});
