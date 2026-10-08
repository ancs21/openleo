import { expect, test } from "bun:test";
import { agentLabel } from "../../shared/types";
import { agentId } from "./format";

test("an agent's display name gives its ID; the display name falls back to the ID", () => {
  expect(agentId("Crypto Researcher ")).toBe("crypto-researcher");
  expect(agentId("  Sales & Leads (EU)!")).toBe("sales-leads-eu");
  expect(agentLabel({ name: "crypto-researcher", title: "Crypto Researcher" })).toBe("Crypto Researcher");
  expect(agentLabel({ name: "boss" })).toBe("boss");
});
