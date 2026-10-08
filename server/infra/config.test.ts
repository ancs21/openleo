import { expect, test } from "bun:test";
import { exposureProblem, isLoopback } from "./config";
import { allowAttempt } from "../http/rate-limit";

test("OpenLeo only listens beyond this machine over HTTPS", () => {
  const url = (u: string) => new URL(u);
  expect(exposureProblem("127.0.0.1", url("http://127.0.0.1:3000"), false)).toBeUndefined(); // the default
  expect(exposureProblem("0.0.0.0", url("http://192.168.1.5:3000"), false)).toContain("https://");
  expect(exposureProblem("0.0.0.0", url("https://openleo.example"), true)).toBeUndefined(); // TLS in the server
  expect(exposureProblem("0.0.0.0", url("https://openleo.example"), false, true)).toBeUndefined(); // HTTPS proxy in front
  expect(exposureProblem("0.0.0.0", url("https://openleo.example"), false, false)).toContain("TLS"); // neither
  expect(isLoopback("127.0.0.1") && isLoopback("localhost") && isLoopback("::1")).toBe(true);
  expect(isLoopback("0.0.0.0") || isLoopback("10.0.0.2")).toBe(false);
});

test("sign-in attempts are limited per visitor", () => {
  const t0 = 1_000_000;
  for (let i = 0; i < 30; i++) expect(allowAttempt("1.2.3.4", t0 + i)).toBe(true);
  expect(allowAttempt("1.2.3.4", t0 + 31)).toBe(false);
  expect(allowAttempt("5.6.7.8", t0 + 31)).toBe(true); // others aren't affected
  expect(allowAttempt("1.2.3.4", t0 + 11 * 60_000)).toBe(true); // ten minutes later
});
