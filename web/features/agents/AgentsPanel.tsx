import { Outlet, useMatch, useNavigate, useOutletContext, useParams } from "react-router";
import { usePanels } from "../../stores/panels";
import { glyphs, Icon } from "../../components/Icon";
import { IconButton } from "../../components/IconButton";
import { useEscape } from "../../lib/hooks";
import { PanelResizer } from "../../components/PanelResizer";

/** Manage a board's agents in a side panel over the board, like a card, so Leo can stay open next to it. */
export function AgentsPanel() {
  const navigate = useNavigate();
  const { boardId } = useParams();
  const { offset } = useOutletContext<{ offset: number }>(); // px taken by Leo to its right
  const width = usePanels((s) => s.panelWidth.card);
  const base = `/b/${boardId}/agents`;
  const atList = !!useMatch("/b/:boardId/agents");
  const close = () => navigate(`/b/${boardId}`);
  useEscape(close, { ignoreFields: true });
  return (
    <aside role="dialog" aria-label="Agents" style={{ right: 12 + offset, width: `min(${width}px, calc(100% - ${24 + offset}px))` }}
      className="absolute top-14 bottom-3 z-30 flex flex-col overflow-hidden rounded-[14px] bg-surface shadow-overlay animate-slide-in-right">
      <PanelResizer panel="card" offset={offset} />
      <div className="flex shrink-0 items-center gap-1 px-5 pt-4">
        {!atList && <IconButton aria-label="All agents" title="All agents" onClick={() => navigate(base)}><Icon size={15}>{glyphs.back}</Icon></IconButton>}
        <span className="text-[13px] text-ink-3">Manage agents</span>
        <span className="flex-1" />
        <IconButton aria-label="Close" title="Close (Esc)" onClick={close}><Icon size={16}>{glyphs.close}</Icon></IconButton>
      </div>
      <Outlet />
    </aside>
  );
}
