import { expect, test } from "bun:test";
import { isPublicHost } from "./favicon";

test("icons are fetched only for public domain names, never local or IP hosts", () => {
  for (const h of ["bun.com", "news.ycombinator.com", "en.wikipedia.org"]) expect(isPublicHost(h)).toBe(true);
  for (const h of ["localhost", "127.0.0.1", "192.168.1.10", "router", "printer.local", "nas.lan", "a..b.com", "evil.com/x", "[::1]"]) expect(isPublicHost(h)).toBe(false);
});
