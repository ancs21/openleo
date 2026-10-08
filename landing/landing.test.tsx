import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

// The app's modules read the theme from the browser when they load; a server render has none.
(globalThis as any).matchMedia ??= () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
const { seed, story, STORY_OPTIONS } = await import("./demo");
const { Landing, detectDownload } = await import("./Landing");
const render = (id: string) => { seed(story(id)); return renderToStaticMarkup(<Landing initialStory={id} />); };
const html = render("sales");
const chapters = (page: string) => [...page.matchAll(/<section class="chapter [^"]*" id="([\w-]+)"/g)].map((m) => m[1]);

test("the landing page tells the story in order, chapter by chapter", () => {
  expect(chapters(html)).toEqual(["monday", "tell-leo", "board", "agents", "watch", "done", "again"]);
});

test("its pictures are the app's own components, drawing the demo board", () => {
  expect(html).toContain('aria-label="Task #14: Find 10 cafés in Da Nang that sell online"'); // a real card
  expect(html).toContain("Add cards"); // Leo's steps, as the chat shows them
  expect(html).toContain("Fill in fields"); // an agent filling in a card
  expect(html).toContain("Repeat"); // the card's Repeat row
});

test("each reader gets their own story: a tech lead's board, Leo request and repeating card", () => {
  expect(STORY_OPTIONS.map((o) => o.label)).toEqual(["Salesperson", "Tech lead", "Accountant", "Marketer"]);
  const tech = render("tech");
  expect(tech).toContain("Review the open pull requests");
  expect(tech).toContain("This week: ship 2.4.");
  expect(tech).toContain("Check staging after each night");
  expect(tech).not.toContain("Find 10 cafés");
  expect(chapters(tech)).toContain("github"); // only developers pull work in from GitHub
  expect(tech).toContain("you/site#42"); // a GitHub list's row
});

test("every way out of the story leads to a download or the code", () => {
  expect(html.match(/href="https:\/\/github\.com\/ancs21\/openleo\/releases\/latest\/download\/macos-arm64-OpenLeo\.dmg"/g)?.length).toBeGreaterThanOrEqual(3);
  expect(html).toContain('href="https://github.com/ancs21/openleo"');
});

test("no lightning icons", () => {
  expect(html).not.toMatch(/\b(zap|lightning|bolt)\b/i); // whole words: "Zapier" is a product name
});

test("the download button picks the installer for the visitor's system", () => {
  const file = (ua: string) => detectDownload(ua).url.split("/").pop();
  expect(file("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15")).toBe("macos-arm64-OpenLeo.dmg");
  expect(file("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140.0")).toBe("win-x64-OpenLeo-Setup.zip");
  expect(file("Mozilla/5.0 (X11; Linux x86_64) Firefox/140.0")).toBe("linux-x64-OpenLeo-Setup.tar.gz");
  expect(file("Mozilla/5.0 (X11; Linux aarch64) Chrome/140.0")).toBe("linux-arm64-OpenLeo-Setup.tar.gz");
  expect(file("Mozilla/5.0 (Linux; Android 15) Chrome/140.0")).toBe("macos-arm64-OpenLeo.dmg"); // phones: the Mac app
});
