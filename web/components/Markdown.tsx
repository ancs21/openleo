// Assistant replies as markdown. react-markdown ignores raw HTML, so model output can't inject markup.
// Only image sources may be inline data: an image can't run code.
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { computerPath, fileKind, fileUrl, inMacApp, readText, saveToDownloads } from "../lib/computer-files";
import ReactMarkdown, { defaultUrlTransform, type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { SourceChip } from "./Source";

const FileIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-ink-3">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" />
  </svg>
);

export function CodeBlock({ code, lang }: { code: string; lang?: string }) {
  const [copied, setCopied] = useState(false);
  const lines = code.replace(/\n$/, "").split("\n");
  const copy = async () => {
    try { await navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1400); } catch {}
  };
  return (
    <div className="my-1 w-full overflow-hidden rounded-card bg-surface shadow-card animate-fade-up">
      <div className="flex h-9 items-center gap-2 border-b border-line px-3 text-[12px]">
        <span className="inline-flex min-w-0 items-center gap-[7px]"><FileIcon /><span className="truncate font-mono leading-none text-ink">{lang || "text"}</span></span>
        <button type="button" aria-label="Copy code" onClick={copy}
          className={`-mr-1 ml-auto flex h-6 items-center gap-1 rounded-[6px] px-1.5 text-[12px] font-medium transition-colors duration-100 hover:bg-hover ${copied ? "text-green" : "text-ink-3 hover:text-ink"}`}>
          {copied
            ? <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
            : <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="12" height="12" rx="2.5" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <div className="max-h-96 overflow-auto py-2.5 font-mono text-[12.5px] leading-[1.65] text-ink-2">
        {lines.map((l, i) => (
          <div key={i} className="grid grid-cols-[28px_minmax(0,1fr)] items-start">
            <span className="text-center text-[11px] text-ink-3 select-none">{i + 1}</span>
            <code className="pr-3 pl-1 break-words whitespace-pre-wrap">{l || " "}</code>
          </div>
        ))}
      </div>
    </div>
  );
}

const IMAGE_DATA = /^data:image\/(png|jpe?g|gif|webp|svg\+xml)[;,]/i;

/** Links keep react-markdown's safe list; images may also be inline data, and either may be a file in the board's computer. */
const urlTransform = (url: string, key: string) => (key === "src" && IMAGE_DATA.test(url)) || computerPath(url) ? url : defaultUrlTransform(url);

export const ComputerBoard = createContext<string | undefined>(undefined);

function FileLink({ path, board, children }: { path: string; board: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} title={path}
        className="text-accent-ink underline decoration-accent-ink/30 underline-offset-2 hover:decoration-current">{children}</button>
      {open && <FileViewer path={path} board={board} onClose={() => setOpen(false)} />}
    </>
  );
}

function FileViewer({ path, board, onClose }: { path: string; board: string; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const url = fileUrl(board, path), kind = fileKind(path), name = path.split("/").pop();
  const [text, setText] = useState<string>();
  const [saved, setSaved] = useState<string>();
  useEffect(() => { ref.current?.showModal(); }, []);
  const saveToMac = async () => setSaved(await saveToDownloads(board, path));
  useEffect(() => {
    if (kind !== "text") return;
    readText(board, path).then(setText, (e) => setText(`⚠ ${e.message}`));
  }, [board, path, kind]);
  return (
    <dialog ref={ref} onClose={onClose} onClick={(e) => { if (e.target === ref.current) ref.current.close(); }}
      className="m-auto flex max-h-[88vh] w-[min(920px,calc(100vw-32px))] flex-col overflow-hidden rounded-card bg-surface p-0 text-ink shadow-overlay animate-pop-in backdrop:bg-black/40">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-line px-4 text-[13px]">
        <span className="min-w-0 flex-1 truncate font-medium" title={path}>{name}</span>
        {saved && <span role="status" className="text-[12.5px] text-ink-3">{saved}</span>}
        {inMacApp()
          ? <button type="button" onClick={() => void saveToMac()} className="rounded-[6px] px-2 py-1 text-ink-2 hover:bg-hover hover:text-ink">Download</button>
          : <a href={url} download={name} className="rounded-[6px] px-2 py-1 text-ink-2 hover:bg-hover hover:text-ink">Download</a>}
        <button type="button" onClick={() => ref.current?.close()} className="rounded-[6px] px-2 py-1 text-ink-2 hover:bg-hover hover:text-ink">Close</button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto bg-page p-4">
        {kind === "image" && <img src={url} alt={name} className="mx-auto h-auto max-w-full object-contain" />}
        {kind === "pdf" && <iframe src={url} title={name} sandbox="" className="h-[75vh] w-full rounded-card bg-surface" />}
        {kind === "text" && (text === undefined ? <p className="text-[13px] text-ink-3">Opening…</p> : <CodeBlock code={text} lang={path.split(".").pop()} />)}
        {kind === "other" && <p className="text-[13px] text-ink-2">This kind of file can't be shown here. Download it to open it.</p>}
      </div>
    </dialog>
  );
}

/** Models write raw <img> tags for pictures they make: turn them into markdown images; other HTML stays text. */
function htmlImages(text: string) {
  return text.replace(/<img\b[^>]*?\ssrc=(["'])(.*?)\1[^>]*?\/?>/gis, (tag, _q, src: string) => {
    if (!IMAGE_DATA.test(src) && !/^https?:\/\//i.test(src)) return tag;
    const alt = /\salt=(["'])(.*?)\1/is.exec(tag)?.[2] ?? "";
    // A markdown link target can't hold spaces, angle brackets or line breaks: encode them.
    return `![${alt.replace(/[[\]]/g, "")}](${src.replace(/[\s<>()]/g, (c) => encodeURIComponent(c))})`;
  });
}

const components: Components = {
  img: ({ src, alt }) => (typeof src === "string" && src ? <ReplyImage src={src} alt={alt ?? ""} /> : null),
  p: ({ children }) => <p className="my-0">{children}</p>,
  // Short labels on web links read as citations: render them as source chips.
  a: ({ href, children }) => href && computerPath(href) ? <ComputerLink path={computerPath(href)!}>{children}</ComputerLink>
    : typeof children === "string" && /^https?:\/\//.test(href ?? "") && children.length <= 28
    ? <SourceChip href={href!} label={children.replace(/^www\./, "")} />
    : <a href={href} target="_blank" rel="noopener noreferrer" className="text-accent-ink underline decoration-accent-ink/30 underline-offset-2 hover:decoration-current">{children}</a>,
  strong: ({ children }) => <strong className="font-semibold text-ink">{children}</strong>,
  ul: ({ children }) => <ul className="my-0 flex list-disc flex-col gap-1 pl-5 marker:text-ink-3">{children}</ul>,
  ol: ({ children }) => <ol className="my-0 flex list-decimal flex-col gap-1 pl-5 marker:text-ink-3">{children}</ol>,
  h1: ({ children }) => <h3 className="mt-1 text-[15px] font-semibold">{children}</h3>,
  h2: ({ children }) => <h3 className="mt-1 text-[14.5px] font-semibold">{children}</h3>,
  h3: ({ children }) => <h4 className="mt-1 text-[14px] font-semibold">{children}</h4>,
  blockquote: ({ children }) => <blockquote className="border-l-2 border-line-strong pl-3 text-ink-2">{children}</blockquote>,
  hr: () => <hr className="border-line" />,
  table: ({ children }) => <div className="overflow-x-auto rounded-card shadow-card [overflow-wrap:normal]"><table className="min-w-full border-collapse text-[12.5px]">{children}</table></div>,
  th: ({ children }) => <th className="border-b border-line bg-inset px-3 py-1.5 text-left align-bottom font-medium text-ink-2"><div className="min-w-28">{children}</div></th>,
  td: ({ children }) => <td className="border-b border-line-soft px-3 py-1.5 align-top"><div className="min-w-28">{children}</div></td>,
  pre: ({ children }) => <>{children}</>,
  code: ({ className, children }) => {
    const text = String(children ?? "");
    const lang = /language-([\w+-]+)/.exec(className ?? "")?.[1];
    if (lang || text.includes("\n")) return <CodeBlock code={text} lang={lang} />;
    return <code className="rounded-[5px] bg-field px-1 py-px font-mono text-[12px] text-ink shadow-hairline">{children}</code>;
  },
};

/** One from the board's computer is read through the app and opens full size when clicked. */
function ReplyImage({ src, alt }: { src: string; alt: string }) {
  const board = useContext(ComputerBoard);
  const path = computerPath(src);
  const [open, setOpen] = useState(false);
  const img = "my-1 h-auto max-h-96 max-w-full self-start object-contain rounded-card bg-surface shadow-card";
  if (!path) return <img src={src} alt={alt} loading="lazy" className={img} />;
  if (!board) return <span className="text-ink-3">[{alt || path}]</span>;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="self-start" title="Open"><img src={fileUrl(board, path)} alt={alt} loading="lazy" className={img} /></button>
      {open && <FileViewer path={path} board={board} onClose={() => setOpen(false)} />}
    </>
  );
}

function ComputerLink({ path, children }: { path: string; children: ReactNode }) {
  const board = useContext(ComputerBoard);
  return board ? <FileLink path={path} board={board}>{children}</FileLink> : <span title={path}>{children}</span>;
}

/** `tone` replaces the default size and colour. */
export function Markdown({ text, caret, tone = "text-[13.5px] leading-[1.6] text-ink" }: { text: string; caret?: ReactNode; tone?: string }) {
  return (
    <div className={`flex flex-col gap-2.5 [overflow-wrap:anywhere] ${tone}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components} urlTransform={urlTransform}>{htmlImages(text)}</ReactMarkdown>
      {caret}
    </div>
  );
}
