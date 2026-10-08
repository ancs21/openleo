import { expect, test } from "bun:test";
import { sameOrigin } from "./sessions";

const req = (method: string, origin?: string) =>
  new Request("http://127.0.0.1:3000/api/boards/main", { method, headers: origin ? { origin } : {} });

test("changes are accepted only from OpenLeo's own pages", () => {
  expect(sameOrigin(req("GET", "https://evil.example"))).toBe(true); // reads don't change anything
  expect(sameOrigin(req("PUT", "http://127.0.0.1:3000"))).toBe(true);
  expect(sameOrigin(req("PUT"))).toBe(true); // non-browser clients send no Origin
  expect(sameOrigin(req("PUT", "https://evil.example"))).toBe(false);
  expect(sameOrigin(req("POST", "http://localhost:3000"))).toBe(false); // different host = different site for cookies
});
