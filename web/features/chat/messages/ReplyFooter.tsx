import { useState } from "react";
import { glyphs } from "../../../components/Icon";
import { SourceList, SourceStack } from "../../../components/Source";

const ICONS = {
  copy: <><rect x="9" y="9" width="12" height="12" rx="2.5" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>,
  copied: glyphs.check,
  retry: <path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6" />,
};

function Action({ label, icon, onClick }: { label: string; icon: keyof typeof ICONS; onClick: () => void }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick}
      className="flex size-6 items-center justify-center rounded-[6px] text-ink-3 transition-colors duration-100 hover:bg-hover-2 hover:text-ink-2">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICONS[icon]}</svg>
    </button>
  );
}

/** Under a finished reply: copy, ask again (latest reply only), and the sources it used. */
export function ReplyFooter({ text, sources, onRetry }: { text: string; sources: string[]; onRetry?: () => void }) {
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1400); } catch {}
  };
  return (
    <div className="animate-fade-in">
      <div className="-ml-1 flex items-center gap-0.5">
        {text && <Action label={copied ? "Copied" : "Copy"} icon={copied ? "copied" : "copy"} onClick={() => void copy()} />}
        {onRetry && <Action label="Ask again" icon="retry" onClick={onRetry} />}
        {sources.length > 0 && <span className="ml-1"><SourceStack urls={sources} open={open} onToggle={() => setOpen(!open)} /></span>}
      </div>
      {sources.length > 0 && <SourceList urls={sources} open={open} />}
    </div>
  );
}
