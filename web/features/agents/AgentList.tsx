import { Link, useParams } from "react-router";
import { Icon, glyphs } from "../../components/Icon";
import { agentLabel } from "../../../shared/types";
import { useApp } from "../../stores/app-store";
import { AgentIcon } from "../../components/AgentIcon";

/** The agents panel's first view: New agent, then this board's agents. */
export function AgentList() {
  const agents = useApp((s) => s.agents);
  const { boardId } = useParams();
  const base = `/b/${boardId}/agents`;
  const row = "flex items-center gap-2.5 rounded-[8px] px-2 py-2 text-left text-[13.5px] text-ink-2 transition-colors duration-100 hover:bg-hover hover:text-ink";
  return (
    <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-3 pt-2 pb-4" aria-label="Agents">
      <Link to={`${base}/new`} className={row}><Icon strokeWidth={2.2}>{glyphs.plus}</Icon>New agent</Link>
      {agents.length > 0 && <div className="px-2 pt-3 pb-1 text-[11.5px] font-medium text-ink-3">This board's agents</div>}
      {agents.map((a) => (
        <Link key={a.name} to={`${base}/${a.name}`} className={row}>
          <AgentIcon icon={a.icon} />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium text-ink">{agentLabel(a)}</span>
            {a.description && <span className="block truncate text-[12.5px] text-ink-3">{a.description}</span>}
          </span>
        </Link>
      ))}
    </nav>
  );
}
