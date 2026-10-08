import { expect, test } from "bun:test";
import { buildQuery, readQuery } from "./github-query";

test("plain choices become a GitHub search, and back", () => {
  expect(buildQuery("prs", "me/app")).toBe("is:pr is:open repo:me/app");
  expect(buildQuery("review", "")).toBe("is:pr is:open review-requested:@me");
  expect(readQuery("is:issue is:open repo:org/site")).toEqual({ show: "issues", repo: "org/site" });
  expect(buildQuery("project", "acme/1")).toBe("project:acme/1");
  expect(readQuery("project:acme/1")).toEqual({ show: "project", repo: "acme/1" });
  expect(readQuery("repo:me/app label:bug")).toBeUndefined(); // written by hand: edited as text
});
