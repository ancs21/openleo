import { expect, test } from "bun:test";
import { accountOf, forgetAccount, rememberAccount, sameOrigin } from "./sessions";

const req = (method: string, origin?: string) =>
  new Request("http://127.0.0.1:3000/api/boards/main", { method, headers: origin ? { origin } : {} });

test("changes are accepted only from OpenLeo's own pages", () => {
  expect(sameOrigin(req("GET", "https://evil.example"))).toBe(true); // reads don't change anything
  expect(sameOrigin(req("PUT", "http://127.0.0.1:3000"))).toBe(true);
  expect(sameOrigin(req("PUT"))).toBe(true); // non-browser clients send no Origin
  expect(sameOrigin(req("PUT", "https://evil.example"))).toBe(false);
  expect(sameOrigin(req("POST", "http://localhost:3000"))).toBe(false); // different host = different site for cookies
});

test("a forgotten account is no longer remembered by this browser", () => {
  const remembered = rememberAccount(req("GET"), "abc123");
  expect(remembered).toStartWith("openleo_account=abc123;");
  expect(accountOf(new Request("http://127.0.0.1:3000/login", { headers: { cookie: remembered.split(";")[0]! } }))).toBe("abc123");
  const forgotten = forgetAccount(req("GET"));
  expect(forgotten).toContain("Max-Age=0"); // the browser drops it
  expect(accountOf(new Request("http://127.0.0.1:3000/login", { headers: { cookie: forgotten.split(";")[0]! } }))).toBeFalsy();
});
