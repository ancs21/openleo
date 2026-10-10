import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { CatalogApp, McpServerInfo } from "../../../shared/types";
import { Button } from "../../components/Button";
import { Dialog } from "../../components/Dialog";
import { Icon, glyphs } from "../../components/Icon";
import { Spinner } from "../../components/motion";
import { Segmented } from "../../components/Segmented";
import { api } from "../../lib/api";
import { toId } from "../../lib/format";
import { useApp } from "../../stores/app-store";
import { empty, Group, Info, inputCls, Label, LinkButton, Section } from "../../components/form";
import { titleOf } from "./templates";

const Attached = ({ label, info, extra, onRemove }: { label: string; info?: string; extra?: ReactNode; onRemove: () => void }) => (
  <div className="flex min-h-9 items-center gap-2">
    <span className="min-w-0 truncate text-[13.5px]">{label}</span>
    {info && <Info text={info} />}
    <span className="flex-1" />
    {extra}
    <LinkButton onClick={onRemove}>Remove</LinkButton>
  </div>
);

/** The focus ring sits inside so the dialog edge can't clip it. */
export const SearchBox = ({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) => (
  <label className="flex h-9 shrink-0 items-center gap-2 rounded-control bg-field px-3 text-ink-3 shadow-inset-field focus-within:ring-2 focus-within:ring-accent/40 focus-within:ring-inset">
    <Icon>{glyphs.search}</Icon>
    <input autoFocus type="search" aria-label="Search" placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)}
      className="min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-3 [&::-webkit-search-cancel-button]:hidden" />
    {value && <button type="button" aria-label="Clear search" onClick={() => onChange("")} className="rounded-[4px] text-ink-3 hover:text-ink"><Icon size={12}>{glyphs.close}</Icon></button>}
  </label>
);
export const matches = (q: string, ...texts: string[]) => !q.trim() || texts.join(" ").toLowerCase().includes(q.trim().toLowerCase());
export const AddedMark = () => <span className="flex h-7 shrink-0 items-center gap-1 px-1.5 text-[12.5px] font-medium text-green"><Icon size={13}>{glyphs.check}</Icon>Added</span>;
const AddButton = ({ label, onClick }: { label: string; onClick: () => void }) => (
  <Button type="button" className="h-7 shrink-0 gap-1 px-2 text-[12.5px]" aria-label={label} onClick={onClick}><Icon size={12}>{glyphs.plus}</Icon>Add</Button>
);
export const NewButton = ({ children, onClick }: { children: ReactNode; onClick: () => void }) => (
  <Button type="button" onClick={onClick}><Icon size={12}>{glyphs.plus}</Icon>{children}</Button>
);
export const card = "flex h-full items-start gap-3 rounded-card border border-line p-3";
export const grid = "grid auto-rows-min grid-cols-2 gap-2.5 max-sm:grid-cols-1";

const status = (s: McpServerInfo) =>
  s.error ? <span title={s.error} className="max-w-48 truncate text-[12px] text-red">Can't connect</span>
  : <span className="text-[12px] text-ink-3">{s.tools.length} {s.tools.length === 1 ? "action" : "actions"}</span>;

export function AppsSection({ selected, onToggle }: { selected: string[]; onToggle: (name: string, on?: boolean) => void }) {
  const servers = useApp((s) => s.mcp);
  const [picking, setPicking] = useState(false);
  const [connecting, setConnecting] = useState<{ app?: CatalogApp } | null>(null); // a catalog app, or a custom one
  const mine = servers.filter((s) => selected.includes(s.name));
  return (
    <Section title="Connected apps"
      info="Let the agent use other services, like your calendar, CRM or database, through MCP: the standard way apps offer actions to AI agents."
      action={!connecting && <LinkButton onClick={() => setPicking(true)}>Add an app</LinkButton>}>
      {connecting ? (
        <AppForm app={connecting.app} onDone={(saved) => { setConnecting(null); if (saved) onToggle(saved, true); }} />
      ) : mine.length ? (
        <Group>
          {mine.map((s) => <Attached key={s.name} label={titleOf(s.name)} info={s.error ?? (s.tools.map((t) => t.label).join(", ") || "No actions")}
            extra={status(s)} onRemove={() => onToggle(s.name, false)} />)}
        </Group>
      ) : <p className="text-[13px] text-ink-3">No apps yet.</p>}
      {picking && <AppPicker selected={selected} onAdd={(n) => onToggle(n, true)} onClose={() => setPicking(false)}
        onConnect={(app) => { setPicking(false); setConnecting({ app }); }} />}
    </Section>
  );
}

const SIGN_IN: Record<CatalogApp["auth"], string> = { "API key": "Needs an API key", "OAuth or API key": "Use an API key", None: "No sign-in needed" };
const SHOWN = 60; // catalog cards before "Show more"

/** The app's mark in its own colour (very dark marks follow the text colour, so they show in dark mode), or its initial. */
function AppMark({ name, icon }: { name: string; icon?: CatalogApp["icon"] }) {
  const frame = "flex size-9 shrink-0 items-center justify-center rounded-control bg-field shadow-hairline";
  if (!icon) return <span className={`${frame} text-[13px] font-semibold text-ink-2`}>{name.slice(0, 1).toUpperCase()}</span>;
  const n = parseInt(icon.hex.slice(1), 16);
  const dark = ((n >> 16) & 255) + ((n >> 8) & 255) + (n & 255) < 120;
  return <span className={frame}><svg viewBox="0 0 24 24" className="size-5" fill={dark ? "currentColor" : icon.hex} aria-hidden="true"><path d={icon.path} /></svg></span>;
}

let catalog: Promise<CatalogApp[]> | undefined; // fetched once per page load
const loadCatalog = () => (catalog ??= api<CatalogApp[]>("/api/mcp-directory").catch((e) => { catalog = undefined; throw e; }));

function AppPicker({ selected, onAdd, onConnect, onClose }: {
  selected: string[]; onAdd: (name: string) => void; onConnect: (app?: CatalogApp) => void; onClose: () => void;
}) {
  const servers = useApp((s) => s.mcp);
  const deleteMcp = useApp((s) => s.deleteMcp);
  const [apps, setApps] = useState<CatalogApp[] | "failed">();
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [limit, setLimit] = useState(SHOWN);
  const [removing, setRemoving] = useState<string>(); // disconnecting removes the app (and its key) for every agent
  useEffect(() => { loadCatalog().then(setApps, () => setApps("failed")); }, []);
  useEffect(() => setLimit(SHOWN), [q, category]);

  const list = useMemo(() => (Array.isArray(apps) ? apps : []), [apps]);
  const categories = useMemo(() => {
    const count = new Map<string, number>();
    for (const a of list) count.set(a.category, (count.get(a.category) ?? 0) + 1);
    return [...count].sort((a, b) => b[1] - a[1]).map(([c]) => c);
  }, [list]);
  const byUrl = new Map(servers.flatMap((s) => (s.url ? [[s.url, s] as const] : [])));
  const yours = category ? [] : servers.filter((s) => matches(q, s.name));
  const shown = list.filter((a) => (!category || a.category === category) && matches(q, a.name, a.category, a.summary));

  return (
    <Dialog title="Add an app" onClose={onClose} footer={<NewButton onClick={() => onConnect()}>Add a custom app</NewButton>}>
      <SearchBox value={q} onChange={setQ} placeholder="Search apps, like Linear or Stripe" />
      {categories.length > 0 && (
        <div className="flex shrink-0 flex-wrap gap-1">
          {["", ...categories].map((c) => (
            <button key={c || "all"} type="button" aria-pressed={category === c} onClick={() => setCategory(c)}
              className={`h-7 shrink-0 rounded-full px-2.5 text-[12.5px] font-medium transition-colors duration-100 ${category === c ? "bg-ink text-surface" : "text-ink-2 hover:bg-hover"}`}>
              {c || "All"}
            </button>
          ))}
        </div>
      )}
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
        {yours.length > 0 && (
          <section>
            <h3 className="mb-1.5 text-[12.5px] font-medium text-ink-3">Your apps</h3>
            <ul className={grid}>
              {yours.map((s) => (
                <li key={s.name} className={card}>
                  <AppMark name={s.name} icon={list.find((a) => a.url === s.url)?.icon} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13.5px] font-medium">{titleOf(s.name)}</div>
                    <div className="mt-0.5">{status(s)}</div>
                    <div className="mt-1 -ml-1.5 flex gap-1">
                      {removing === s.name
                        ? <><LinkButton danger onClick={() => void deleteMcp(s.name)}>Disconnect for all agents</LinkButton><LinkButton onClick={() => setRemoving(undefined)}>Keep</LinkButton></>
                        : <LinkButton onClick={() => setRemoving(s.name)}>Disconnect</LinkButton>}
                    </div>
                  </div>
                  {selected.includes(s.name) ? <AddedMark /> : <AddButton label={`Add ${s.name}`} onClick={() => onAdd(s.name)} />}
                </li>
              ))}
            </ul>
          </section>
        )}
        <section>
          {yours.length > 0 && <h3 className="mb-1.5 text-[12.5px] font-medium text-ink-3">More apps</h3>}
          {apps === undefined ? <div className={`${empty} flex items-center justify-center gap-2`}><Spinner /> Loading apps…</div>
            : apps === "failed" ? <p className={empty}>Can't load the app list. You can still add an app by its address.</p>
            : !shown.length ? <p className={empty}>No apps match. Try other words, or add one by its address.</p>
            : (
              <ul className={grid}>
                {shown.slice(0, limit).map((a) => {
                  const connected = byUrl.get(a.url);
                  return (
                    <li key={a.slug} className={card}>
                      <AppMark name={a.name} icon={a.icon} />
                      <div className="min-w-0 flex-1">
                        <div className="text-[13.5px] font-medium">{a.name}</div>
                        <p className="mt-0.5 line-clamp-2 text-[12.5px] text-ink-2">{a.summary}</p>
                        <div className="mt-0.5 text-[12px] text-ink-3">{connected ? "Connected" : SIGN_IN[a.auth]}</div>
                      </div>
                      {connected && selected.includes(connected.name) ? <AddedMark />
                        : <AddButton label={`Add ${a.name}`} onClick={() => (connected ? onAdd(connected.name) : onConnect(a))} />}
                    </li>
                  );
                })}
                {shown.length > limit && (
                  <li className="col-span-full flex justify-center pt-1"><Button type="button" onClick={() => setLimit(limit + SHOWN)}>Show more</Button></li>
                )}
              </ul>
            )}
        </section>
      </div>
    </Dialog>
  );
}

function AppForm({ app, onDone }: { app?: CatalogApp; onDone: (savedName?: string) => void }) {
  const [kind, setKind] = useState<"url" | "command">("url");
  const [name, setName] = useState(app ? toId(app.slug) : "");
  const [url, setUrl] = useState(app?.url ?? "");
  const [key, setKey] = useState("");
  const [command, setCommand] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const saveMcp = useApp((s) => s.saveMcp);
  const keyed = kind === "url" && app?.auth !== "None";
  const needsKey = app?.auth === "API key";
  const save = async () => {
    setBusy(true); setError(undefined);
    try {
      const info = await saveMcp(name, kind === "url" ? { url, ...(key ? { headers: { Authorization: `Bearer ${key}` } } : {}) } : { command });
      if (info.error) setError(`Saved, but it couldn't connect: ${info.error}`);
      else onDone(name);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  return (
    <div className="flex flex-col gap-3 rounded-card border border-line bg-surface p-3.5">
      {app && (
        <div className="flex items-center gap-3">
          <AppMark name={app.name} icon={app.icon} />
          <div className="min-w-0">
            <div className="text-[13.5px] font-medium">Connect {app.name}</div>
            <div className="truncate font-mono text-[11.5px] text-ink-3">{app.url}</div>
          </div>
        </div>
      )}
      <Label text="Name" hint="how agents refer to it"><input className={inputCls} placeholder="Calendar" value={name} onChange={(e) => setName(toId(e.target.value))} /></Label>
      {!app && <Segmented className="w-full" value={kind} onChange={setKind} options={[{ value: "url", label: "Web address" }, { value: "command", label: "Program on this computer" }]} />}
      {!app && kind === "url" && <Label text="Address" hint="from the app's MCP settings"><input className={inputCls} type="url" placeholder="https://example.com/mcp" value={url} onChange={(e) => setUrl(e.target.value)} /></Label>}
      {keyed && (
        <Label text="API key" hint={`${needsKey ? "required" : "optional"}, stored only on this computer`}>
          <input className={inputCls} type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} />
        </Label>
      )}
      {keyed && app && <a href={app.docs} target="_blank" rel="noopener noreferrer" className="-mt-1 text-[12.5px] text-accent-ink underline-offset-2 hover:underline">Where to find the key →</a>}
      {kind === "command" && (
        <Label text="Command" hint="runs on this computer, only add programs you trust">
          <input className={`${inputCls} font-mono text-[12.5px]`} placeholder="bunx some-mcp-server" value={command} onChange={(e) => setCommand(e.target.value)} />
        </Label>
      )}
      {error && <p role="alert" className="text-[12.5px] break-words text-red">{error}</p>}
      <div className="flex items-center justify-end gap-2">
        {busy && <span className="mr-auto flex items-center gap-1.5 text-[12px] text-ink-3"><Spinner /> Connecting…</span>}
        <Button type="button" onClick={() => onDone(error?.startsWith("Saved") ? name : undefined)}>{error?.startsWith("Saved") ? "Close" : "Cancel"}</Button>
        <Button type="button" variant="primary" disabled={busy || !name || (kind === "url" ? !url || (needsKey && !key) : !command)} onClick={() => void save()}>Connect</Button>
      </div>
    </div>
  );
}
