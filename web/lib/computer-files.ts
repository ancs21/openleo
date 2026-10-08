// Files in a board's computer that an agent links in its reply (`sandbox:/mnt/data/chart.png`, `/home/openleo/...`):
// the app shows them itself, through /api/boards/:board/computer/file, instead of a dead link.

/** Folders an agent's files live in on the computer (its home, scratch space). Other paths are the app's own pages. */
const COMPUTER_DIRS = /^\/(home|mnt|tmp|root|Users|workspace|data|opt|srv|var)\//;

/** The path in the computer a link points at, or undefined for any other link. */
export function computerPath(url: string): string | undefined {
  let path = url;
  if (/^sandbox:/i.test(url)) path = url.slice(8);
  else if (/^file:\/\//i.test(url)) path = url.slice(7);
  try { path = decodeURI(path); } catch {}
  return path.startsWith("/") && (path !== url || COMPUTER_DIRS.test(path)) && !path.includes("/../") ? path : undefined;
}

const KINDS: [RegExp, "image" | "pdf" | "text"][] = [
  [/\.(png|jpe?g|gif|webp|svg|bmp|ico)$/i, "image"],
  [/\.pdf$/i, "pdf"],
  [/\.(txt|md|markdown|csv|tsv|json|ya?ml|toml|xml|html?|css|js|jsx|ts|tsx|py|rb|go|rs|java|c|h|cpp|sh|sql|log|ini|env)$/i, "text"],
];
/** How the app shows a file: as a picture, a document, text, or only a download. */
export const fileKind = (path: string) => KINDS.find(([re]) => re.test(path))?.[1] ?? "other";

/** Where the app reads a file of a board's computer. */
export const fileUrl = (board: string, path: string) => `/api/boards/${board}/computer/file?path=${encodeURIComponent(path)}`;

/** Inside the Mac app: its web view (WebKit without Safari) can't download, so files are saved through the server. */
export const inMacApp = () => /AppleWebKit/.test(navigator.userAgent) && !/Safari\//.test(navigator.userAgent);

/** A text file's contents, for the viewer. */
export async function readText(board: string, path: string) {
  const r = await fetch(fileUrl(board, path));
  if (!r.ok) throw new Error(`couldn't open it (${r.status})`);
  return r.text();
}

/** In the Mac app: save the file to this Mac's Downloads folder. Returns what to tell the person. */
export async function saveToDownloads(board: string, path: string) {
  const r = await fetch(`/api/boards/${board}/computer/file/save`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ path }) });
  const body = await r.json().catch(() => ({}));
  return r.ok ? "Saved to Downloads" : body.error ?? "Couldn't save it";
}
