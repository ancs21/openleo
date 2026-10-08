import { useEffect, useState } from "react";
import { usePanels } from "../../stores/panels";
import { agentsUrl, useApp } from "../../stores/app-store";
import { api } from "../../lib/api";
import { Icon, glyphs } from "../../components/Icon";
import { IconButton } from "../../components/IconButton";
import { useEscape } from "../../lib/hooks";
import { Logo } from "../../components/Logo";
import { ChatPanel } from "../chat/ChatPanel";
import { storage } from "../../lib/storage";
import { PanelResizer } from "../../components/PanelResizer";
import { useBoard } from "./store";
import { LEO, LEO_MODEL, type Effort, type Tuning } from "../../../shared/types";

/**
 * Leo: the board's built-in assistant, in a side panel. One current conversation per board.
 * `escape`: Esc closes it (off while a card is open next to it: Esc closes the card first).
 */
export function Leo({ onClose, escape }: { onClose: () => void; escape: boolean }) {
  const { boardId, load } = useBoard();
  const width = usePanels((s) => s.panelWidth.leo);
  const [settings, setSettings] = useState<{ model: string; effort?: Effort }>({ model: LEO_MODEL });
  useEffect(() => { api<typeof settings>("/api/leo").then(setSettings, () => {}); }, []);
  const tune = (patch: Tuning) => {
    const before = settings;
    setSettings({ ...settings, ...patch });
    api<typeof settings>("/api/leo", { method: "PUT", body: JSON.stringify(patch) }).then(setSettings, () => setSettings(before));
  };
  useEscape(onClose, { ignoreFields: true, enabled: escape });
  // The board's current chat with Leo (per browser); /new starts another, the old one stays saved.
  const chatKey = `leo-chat-${boardId}`;
  const [chat, setChat] = useState(() => storage.get(chatKey) ?? `${LEO}-${boardId}`);
  useEffect(() => setChat(storage.get(chatKey) ?? `${LEO}-${boardId}`), [chatKey]);
  const newChat = () => { const id = `${LEO}-${boardId}-${crypto.randomUUID().slice(0, 8)}`; storage.set(chatKey, id); setChat(id); };
  // It changes the board (and can add agents) as it works: keep both fresh while the panel is open.
  // ponytail: polls agents too; push changes from the server if this ever costs too much.
  useEffect(() => {
    const t = setInterval(() => { void load(); void useApp.getState().loadAgents().catch(() => {}); }, 2000);
    return () => clearInterval(t);
  }, [load]);

  return (
    <aside role="dialog" aria-label="Leo" style={{ width: `min(${width}px, calc(100% - 24px))` }}
      className="absolute top-14 right-3 bottom-3 z-30 flex flex-col overflow-hidden rounded-[14px] bg-surface shadow-overlay animate-slide-in-right">
      <PanelResizer panel="leo" />
      <div className="flex shrink-0 items-center gap-2 px-5 pt-4 pb-2">
        <Logo className="size-5" />
        <h2 className="text-[15px] font-semibold text-ink">Leo</h2>
        <span className="flex-1" />
        <IconButton aria-label="Close" onClick={onClose}><Icon size={16}>{glyphs.close}</Icon></IconButton>
      </div>
      <div className="flex min-h-0 flex-1 flex-col px-5">
        <ChatPanel compact agent={LEO} assistant={{ ...settings, tune }} placeholder="Ask Leo…  / for commands" key={chat} url={`${agentsUrl(boardId)}/${LEO}/${chat}`} onNew={newChat} board={boardId}
          emptyText="Ask me to add cards, set up lists and fields, or put an agent to work. For example: “Add 5 cards to Todo for launching the new site, and have the researcher start on the first one.”" />
      </div>
    </aside>
  );
}
