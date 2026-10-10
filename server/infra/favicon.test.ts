import { expect, test } from "bun:test";
import { fetchIcon, iconLinks, isPublicHost } from "./favicon";

test("icons are fetched only for public domain names, never local or IP hosts", () => {
  for (const h of ["bun.com", "news.ycombinator.com", "en.wikipedia.org"]) expect(isPublicHost(h)).toBe(true);
  for (const h of ["localhost", "127.0.0.1", "192.168.1.10", "router", "printer.local", "nas.lan", "a..b.com", "evil.com/x", "[::1]"]) expect(isPublicHost(h)).toBe(false);
});

test("the page's declared icons come first, best first; only https on public hosts", () => {
  const html = `<link rel="icon" href="/a.ico"><link rel='icon' sizes="192x192" href="https://cdn.example.com/b.png">
    <link rel="apple-touch-icon" sizes="180x180" href="/touch.png"><link rel="mask-icon" href="/m.svg">
    <link rel="icon" href="//www.shop.com/c.png?crop=center&amp;width=32"><link rel="icon" href="http://shop.com/d.png">
    <link rel="icon" href="https://192.168.1.2/e.png"><link rel="stylesheet" href="/s.css">`;
  expect(iconLinks(html, "https://shop.com/")).toEqual([
    "https://shop.com/touch.png", "https://cdn.example.com/b.png", "https://shop.com/a.ico", "https://www.shop.com/c.png?crop=center&width=32",
  ]);
});

test("a site whose /favicon.ico is a web page gets the icon its page declares", async () => {
  const fake = (async (url: string) => {
    if (url === "https://shop.com/") return new Response(`<link rel="icon" href="/brand.ico">`, { headers: { "content-type": "text/html" } });
    if (url === "https://shop.com/brand.ico") return new Response(new Uint8Array([1, 2]), { headers: { "content-type": "image/x-icon" } });
    return new Response("<html>", { headers: { "content-type": "text/html" } });
  }) as typeof fetch;
  expect((await fetchIcon("shop.com", fake))?.type).toBe("image/x-icon");
  expect(await fetchIcon("other.com", fake)).toBeNull();
});
