// A list that shows a GitHub search (pull requests, issues) instead of its own cards; server/infra/github.ts fetches it.
// Rows sync when someone presses Sync (GitHub limits requests per hour); dragging one onto another list (or "Add to")
// turns it into a card there.
import { useCallback, useEffect, useRef, useState } from "react";
import { draggable } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { tiltedPreview } from "./dnd";
import type { GithubRow, List } from "../../../shared/types";
import { Button } from "../../components/Button";
import { fieldClass } from "../../components/field";
import { Icon, glyphs } from "../../components/Icon";
import { Modal } from "../../components/Modal";
import { Segmented } from "../../components/Segmented";
import { Select } from "../../components/Select";
import { buildQuery, readQuery, SHOWS, type Show } from "../../lib/github-query";
import { MenuItem, Popover } from "../../components/Popover";
import { api, json } from "../../lib/api";
import { timeAgo } from "../../lib/format";
import { useBoard } from "./store";

type Rows = { rows: GithubRow[]; syncedAt: number | null };
type Account = { connected: boolean; login?: string };

// A project's own Status words (Todo, In Progress…) show in the plain colour.
const STATUS_TONE: Record<string, string> = { open: "text-green", draft: "text-ink-3", merged: "text-accent-ink", closed: "text-red", done: "text-ink-3" };

/** Set up a GitHub list: connect GitHub, then pick what to show and from which repo (or write the search by hand). */
export function GithubSourceDialog({ list, open, onClose }: { list: List; open: boolean; onClose: () => void }) {
  const setListSource = useBoard((s) => s.setListSource);
  const [account, setAccount] = useState<Account>();
  const [repos, setRepos] = useState<string[]>();
  const [projects, setProjects] = useState<{ id: string; title: string }[]>();
  const [show, setShow] = useState<Show>("prs");
  const [repo, setRepo] = useState("");
  const [custom, setCustom] = useState<string>(); // a search written by hand; undefined: built from the choices
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!open) return;
    const saved = list.source?.query;
    const choices = saved ? readQuery(saved) : { show: "prs" as Show, repo: "" };
    if (choices) { setShow(choices.show); setRepo(choices.repo); setCustom(undefined); } else setCustom(saved);
    api<Account>("/api/github").then(setAccount, () => setAccount({ connected: false }));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open || !account?.connected) return;
    setError(undefined);
    api<string[]>("/api/github/repos").then(setRepos, (e) => { setRepos([]); setError((e as Error).message); });
  }, [open, account?.connected]);
  useEffect(() => {
    if (!open || !account?.connected || show !== "project" || projects) return;
    api<{ id: string; title: string }[]>("/api/github/projects").then(setProjects, (e) => { setProjects([]); setError((e as Error).message); });
  }, [open, account?.connected, show, projects]);

  const query = custom ?? buildQuery(show, repo);
  // A search for every pull request on GitHub isn't a list: pull requests and issues need a repo.
  const ready = !!account?.connected && !!query.trim() && (custom !== undefined || show === "review" || !!repo);
  const isProject = show === "project";
  const pickFrom = isProject ? projects : repos;
  const disconnect = async () => { await api("/api/github", { method: "DELETE" }); setAccount({ connected: false }); setRepos(undefined); };
  const repoOptions = isProject
    ? [...(projects ?? []).map((p) => ({ value: p.id, label: p.title || p.id, extra: p.id.split("/")[0] })), ...(repo && !projects?.some((p) => p.id === repo) ? [{ value: repo, label: repo }] : [])]
    : [...(show === "review" ? [{ value: "", label: "Any repo" }] : []), ...(repos ?? []).map((r) => ({ value: r, label: r })),
      ...(repo && !repos?.includes(repo) ? [{ value: repo, label: repo }] : [])];

  return (
    <Modal open={open} onClose={onClose} title="GitHub items" className="w-[min(440px,calc(100vw-32px))] text-left"
      actions={<><Button type="submit">Cancel</Button><Button type="submit" variant="primary" disabled={!ready} onClick={() => setListSource(list.id, { kind: "github", query: query.trim() })}>Show</Button></>}>
      <p>Drag any item to a list to make it a card.</p>
      {!account ? <p className="mt-4 text-ink-3">Checking GitHub…</p> : !account.connected ? (
        <div className="mt-4"><Connect onConnected={setAccount} /></div>
      ) : (
        <div className="mt-4 flex flex-col gap-3">
          <p className="flex items-center gap-1.5 text-[12.5px] text-ink-3">
            <Icon size={13} className="text-green">{glyphs.check}</Icon>Connected{account.login ? ` as ${account.login}` : ""}
            <span className="flex-1" /><button type="button" onClick={() => void disconnect()} className="text-ink-3 hover:text-ink hover:underline">Disconnect</button>
          </p>
          {custom === undefined && <>
            <label className="flex flex-col gap-1.5"><span className="text-[12.5px] font-medium text-ink">Show</span>
              <Segmented value={show} options={SHOWS} onChange={(v) => { if ((v === "project") !== isProject) setRepo(""); setShow(v); }} />
            </label>
            <div className="flex flex-col gap-1.5"><span className="text-[12.5px] font-medium text-ink">From</span>
              {pickFrom === undefined ? <p className="text-[12.5px] text-ink-3">{isProject ? "Loading projects…" : "Loading repos…"}</p>
                : repoOptions.length ? <Select label={isProject ? "Project" : "Repository"} value={repo} options={repoOptions} onChange={setRepo} search placeholder={isProject ? "Choose a project" : "Choose a repo"} />
                : <p className="text-[12.5px] text-ink-3">{isProject ? "No projects found for this token." : "No repos found for this token."}</p>}
            </div>
          </>}
          {error && <p role="alert" className="text-[12.5px] text-red">{error}</p>}
          <details open={custom !== undefined} className="text-[12.5px]">
            <summary className="cursor-pointer text-ink-3 select-none hover:text-ink">Custom search</summary>
            <input aria-label="GitHub search" value={query} onChange={(e) => setCustom(e.target.value)} placeholder="repo:owner/name is:pr is:open label:bug"
              className={`${fieldClass} mt-2 h-8 w-full px-2.5 font-mono text-[12px]`} />
            {custom !== undefined && <button type="button" onClick={() => setCustom(undefined)} className="mt-1 text-accent-ink hover:underline">Reset</button>}
          </details>
        </div>
      )}
    </Modal>
  );
}

/** The rows of a GitHub list, in place of its cards. */
export function GithubRows({ list }: { list: List }) {
  const { boardId, board, addRow } = useBoard();
  const base = `/api/boards/${boardId}/lists/${list.id}/github`;
  const [account, setAccount] = useState<Account>();
  const [data, setData] = useState<Rows>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const sync = useCallback(async () => {
    setBusy(true);
    try { setData(await api<Rows>(`${base}/sync`, { method: "POST" })); setError(undefined); }
    catch (e) { setError((e as Error).message); } // the rows on screen stay: a failed sync isn't "nothing open"
    finally { setBusy(false); }
  }, [base]);

  useEffect(() => {
    let live = true;
    void Promise.all([api<Account>("/api/github"), api<Rows>(base)]).then(([a, d]) => {
      if (!live) return;
      setAccount(a); setData(d);
      if (a.connected && d.syncedAt === null) void sync(); // a list that has never synced fetches once
    }, (e) => live && setError((e as Error).message));
    return () => { live = false; };
  }, [base, list.source?.query, sync]);

  const targets = board?.lists.filter((l) => !l.source) ?? [];
  const added = new Set(Object.values(board?.cards ?? {}).flatMap((c) => (c.source ? [c.source] : []))); // rows already made cards

  if (account && !account.connected) return <div className="px-3 pb-3"><Connect onConnected={(a) => { setAccount(a); void sync(); }} /></div>;
  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 px-3 pb-1.5 text-[12px] text-ink-3">
        <span className="min-w-0 flex-1 truncate" title={list.source?.query}>{data?.syncedAt ? `Synced ${timeAgo(data.syncedAt)}` : "Not synced"}</span>
        <Button className="h-6 px-2 text-[12px]" onClick={() => void sync()} disabled={busy}>{busy ? "Syncing…" : "Sync"}</Button>
      </div>
      {error && <p role="alert" className="mx-3 mb-1.5 text-[12px] text-red">{error}</p>}
      <div className="flex min-h-10 flex-col gap-2 overflow-y-auto rounded-b-[14px] px-2 pt-1 pb-2">
        {data?.syncedAt && !data.rows.length && <p className="px-1 py-2 text-[12.5px] text-ink-3">No items.</p>}
        {data?.rows.map((r) => <Row key={r.key} row={r} listId={list.id} added={added.has(r.key)} targets={targets} onAdd={(to) => void addRow(list.id, r.key, to)} />)}
      </div>
    </div>
  );
}

/** One item: drag it onto another list, or use "Add to", to make it a card there. */
export function Row({ row, listId, added, targets, onAdd }: { row: GithubRow; listId: string; added: boolean; targets: List[]; onAdd: (listId: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const dragging = useBoard((s) => s.drag?.id === row.key);
  useEffect(() => {
    const el = ref.current!;
    if (added) return;
    // It drags like a card, so lists show where it will land; the board turns the drop into a new card.
    return draggable({ element: el, getInitialData: () => ({ type: "card", cardId: row.key, listId, row: true }),
      onGenerateDragPreview: ({ nativeSetDragImage, location }) => tiltedPreview({ element: el, input: location.current.input, nativeSetDragImage }) });
  }, [row.key, listId, added]);
  return (
    <div ref={ref} className={`rounded-[10px] bg-surface p-2.5 shadow-card transition-opacity ${added ? "opacity-55" : "cursor-grab active:cursor-grabbing"} ${dragging ? "opacity-35" : ""}`}>
      <div className="flex items-center gap-1.5 text-[11.5px] text-ink-3">
        <span className="min-w-0 truncate tabular-nums">{row.ref}</span>
        <span className={`font-medium ${STATUS_TONE[row.status] ?? "text-ink-2"}`}>{row.status}</span>
        {row.by && <span className="min-w-0 truncate">· {row.by}</span>}
      </div>
      <a href={row.url} target="_blank" rel="noreferrer" className="mt-0.5 block text-[13px] leading-snug text-ink hover:underline">{row.title}</a>
      <div className="mt-1.5 flex justify-end">
        {added ? <span className="text-[11.5px] text-ink-3">On the board</span> : (
          <Popover open={open} onClose={() => setOpen(false)} className="w-48" trigger={
            <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="flex h-6 items-center gap-1 rounded-[6px] px-1.5 text-[12px] text-ink-2 hover:bg-hover hover:text-ink">
              <Icon size={13}>{glyphs.plus}</Icon>Add to<Icon size={11}>{glyphs.chevron}</Icon>
            </button>
          }>
            {targets.map((l) => <MenuItem key={l.id} onClick={() => { setOpen(false); onAdd(l.id); }}>{l.title}{l.agent ? ` · ${l.agent} starts` : ""}</MenuItem>)}
          </Popover>
        )}
      </div>
    </div>
  );
}

/** Connect a GitHub account with a token it can read with (kept on this computer, never shown again). */
function Connect({ onConnected }: { onConnected: (a: Account) => void }) {
  const [token, setToken] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try { onConnected(await api<Account>("/api/github", json({ token }, "PUT"))); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  return (
    <form className="flex flex-col gap-2 text-[12.5px] text-ink-2" onSubmit={(e) => { e.preventDefault(); void save(); }}>
      <p>Connect GitHub with a <a className="text-accent-ink underline underline-offset-2" target="_blank" rel="noreferrer"
        href="https://github.com/settings/personal-access-tokens/new">token</a>.</p>
      <input type="password" aria-label="GitHub token" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} placeholder="github_pat_…"
        className={`${fieldClass} h-8 px-2`} />
      {error && <p role="alert" className="text-red">{error}</p>}
      <Button type="submit" variant="primary" disabled={busy || !token.trim()}>{busy ? "Connecting…" : "Connect"}</Button>
    </form>
  );
}
