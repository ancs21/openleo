// Readable text from an HTML page (for the "Read web pages" tool): scripts, styles and markup removed,
// block elements on their own lines, external link targets kept in parentheses. Uses Bun's HTMLRewriter.
const BLOCK = "p,div,section,article,header,footer,main,nav,li,ul,ol,h1,h2,h3,h4,h5,h6,tr,br,pre,blockquote,table,figure";
const SKIP = "script,style,noscript,svg,template,iframe,head";
const NAMED: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

export const decodeEntities = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (_, e: string) =>
    e[0] !== "#" ? NAMED[e.toLowerCase()]! : String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)));

export const looksLikeHtml = (s: string) => /^\s*(<!doctype html|<html|<head|<body)/i.test(s);

export async function htmlToText(html: string) {
  const out: string[] = [];
  let skip = 0;
  await new HTMLRewriter()
    .on(SKIP, { element(e) { skip++; e.onEndTag(() => { skip--; }); } })
    .on("title", { text(t) { if (t.text.trim()) out.push(`# ${t.text.trim()}\n`); } })
    .on(BLOCK, { element() { out.push("\n"); } })
    .on("a", { element(e) { const href = e.getAttribute("href"); if (href?.startsWith("http")) e.onEndTag(() => { out.push(` (${href})`); }); } })
    .onDocument({ text(t) { if (!skip) out.push(t.text); } })
    .transform(new Response(html))
    .text();
  return decodeEntities(out.join("")).replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}
