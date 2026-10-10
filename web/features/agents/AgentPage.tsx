import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import type { AgentDef } from "../../../shared/types";
import { agentsUrl, useApp } from "../../stores/app-store";
import { TabButton } from "../../components/TabButton";
import { ChatPanel } from "../chat/ChatPanel";
import { AgentBuilder } from "./AgentBuilder";

const EMPTY: AgentDef = { name: "", description: "", model: "", instructions: "", subagents: [] };

export function AgentPage() {
  const { name, conversationId, boardId = "" } = useParams();
  const base = `/b/${boardId}/agents`;
  const navigate = useNavigate();
  const { key } = useLocation();
  const agents = useApp((s) => s.agents);
  const loaded = useApp((s) => s.agentsLoaded);
  const models = useApp((s) => s.models);
  const saved = agents.find((a) => a.name === name);
  const defaultModel = agents.at(-1)?.model ?? models.find((m) => m.startsWith("openai/")) ?? models[0] ?? "";
  const [form, setForm] = useState<AgentDef>(EMPTY);
  const [notice, setNotice] = useState<string>();

  const shownSaved = useRef<AgentDef>(undefined); // the saved version the form was loaded from

  // Load the form when the routed agent changes (not on every refresh, so unsaved edits survive).
  useEffect(() => {
    if (!loaded) return;
    setForm(saved ?? { ...EMPTY, model: defaultModel });
    shownSaved.current = saved;
    setNotice(undefined);
  }, [name, loaded, key]); // eslint-disable-line react-hooks/exhaustive-deps
  // Changed elsewhere: show the new version unless you've edited the form; then only the model follows.
  const savedText = saved && JSON.stringify(saved);
  useEffect(() => {
    const was = shownSaved.current;
    if (!saved || was?.name !== saved.name) return;
    shownSaved.current = saved;
    setForm((f) => (JSON.stringify(f) === JSON.stringify(was) ? saved : { ...f, model: saved.model }));
  }, [savedText]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!name && !form.model && defaultModel) setForm((f) => ({ ...f, model: defaultModel })); }, [defaultModel]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    try {
      setNotice(form.skills?.length ? "Saving and installing skills…" : "Saving…");
      const result = await useApp.getState().saveAgent(form, name);
      navigate(`${base}/${form.name}`); // saving restarts the agent, so open a fresh conversation
      setNotice(savedNotice(result));
    } catch (e) { setNotice((e as Error).message); }
  };
  const remove = async () => {
    if (!name) return;
    await useApp.getState().deleteAgent(name);
    navigate(`/b/${boardId}`);
  };

  if (name && loaded && !saved) return (
    <p className="px-5 py-8 text-center text-[13px] text-ink-3">
      No agent named “{name}”. <Link to={`${base}/new`} className="text-accent-ink underline underline-offset-2">Create one</Link>
    </p>
  );
  const newChat = () => navigate(`${base}/${name}/c/${crypto.randomUUID()}`);
  return (
    <>
      {name && (
        <div role="tablist" className="mx-5 mt-1 flex shrink-0 items-center gap-5 border-b border-line">
          <TabButton active={!conversationId} onClick={() => navigate(`${base}/${name}`)}>Setup</TabButton>
          <TabButton active={!!conversationId} onClick={() => !conversationId && newChat()}>Chat</TabButton>
        </div>
      )}
      {conversationId ? (
        <div className="flex min-h-0 flex-1 flex-col px-5">
          <ChatPanel key={`${name}/${conversationId}`} compact agent={name!} board={boardId} url={`${agentsUrl(boardId)}/${name}/${conversationId}`} onNew={newChat} />
        </div>
      ) : (
        <AgentBuilder form={form} setForm={setForm} isNew={!name} onSave={save} onDelete={remove} onCancel={() => navigate(base)} notice={notice} />
      )}
    </>
  );
}

function savedNotice(result?: { installed: boolean; failed: string[] }) {
  if (!result) return "Saved";
  if (result.failed.length) return `Saved, but couldn't install ${result.failed.join(", ")}: it changed since you checked it, or skills.sh can't be reached.`;
  return result.installed ? "Saved. Skills installed in this board's computer." : "Saved. Its skills go into the board's computer when it first works.";
}
