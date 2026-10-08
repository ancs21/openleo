import { expect, test } from "bun:test";
import { contextText, MEMORY_KEEPER_INSTRUCTIONS } from "./notes";

test("agents are told the user's date, since the computer's clock runs on UTC", () => {
  const text = contextText(new Map([["memory/2026-10-08.md", "- 09:34 · writer: Client prefers PDFs."]]), "2026-10-08", "2026-10-07");
  expect(text).toContain("Today is 2026-10-08 (the user's date).");
  expect(text).toContain("### Notes from today (memory/2026-10-08.md)\n- 09:34 · writer: Client prefers PDFs.");
  expect(contextText(new Map(), "2026-10-08", "2026-10-07")).toContain("There are none yet.");
});

test("the memory keeper takes today from its notes, not from the computer's clock", () => {
  expect(MEMORY_KEEPER_INSTRUCTIONS).not.toContain("date +%F");
  expect(MEMORY_KEEPER_INSTRUCTIONS).toContain("Today is");
});
