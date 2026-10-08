import { expect, test } from "bun:test";
import { decodeEntities, htmlToText, looksLikeHtml } from "./html";

test("HTML becomes readable text without scripts, styles or markup", async () => {
  const html = `<!DOCTYPE html><html><head><title>Bun 1.4</title><style>p{color:red}</style><script>var x=1</script></head>
    <body><nav>Docs</nav><h1>Release</h1><p>Adds <b>Bun.WebView</b> &amp; more. It&#x27;s fast.</p>
    <a href="https://bun.com">site</a><script>track()</script></body></html>`;
  const t = await htmlToText(html);
  expect(t.startsWith("# Bun 1.4")).toBe(true);
  expect(t).toContain("Adds Bun.WebView & more. It's fast.");
  expect(t).toContain("site (https://bun.com)");
  expect(t).not.toMatch(/var x|track\(|color:red|<p>/);
});

test("detects HTML and decodes entities", () => {
  expect(looksLikeHtml("  <!doctype html><p>")).toBe(true);
  expect(looksLikeHtml('{"json": true}')).toBe(false);
  expect(decodeEntities("&lt;a&gt; &quot;x&quot; &#169; &#X41;")).toBe('<a> "x" © A');
});
