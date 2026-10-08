import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Markdown } from "./Markdown";

const html = (text: string) => renderToStaticMarkup(<Markdown text={text} />);

test("a raw <img> of image data or a web image shows as a picture; other HTML stays text", () => {
  const svg = `Here it is:\n\n<img src="data:image/svg+xml;utf8,<svg width='4' height='4' xmlns='http://www.w3.org/2000/svg'><circle cx='2' cy='2' r='2' fill='%23f2a65a'/><text>Meow</text></svg>" width="512" alt="Cute cat" />`;
  expect(html(svg)).toMatch(/<img src="data:image\/svg\+xml;utf8,%3Csvg%20width=&#x27;4.*%3C\/svg%3E" alt="Cute cat"/);
  expect(html(`<img src="https://example.com/a.png" alt="A">`)).toContain('<img src="https://example.com/a.png" alt="A"');
  expect(html(`<img src="javascript:alert(1)">`)).not.toContain("<img");
  expect(html(`![x](data:text/html,<b>hi</b>)`)).not.toContain("data:text/html");
  expect(html(`[link](data:image/png;base64,AAAA)`)).not.toContain('href="data:'); // only images get image data
  expect(html(`<script>alert(1)</script>`)).not.toContain("<script");
});
