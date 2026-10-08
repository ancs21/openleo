import { expect, test } from "bun:test";
import { cleanValue, fieldId, inferType, parseFields, parseValues, type Field } from "./fields";

test("a new field's type comes from its first value", () => {
  expect([inferType("2026-10-07"), inferType("$45,000"), inferType("1.5M"), inferType("example.com/a"), inferType("e.g. soon")])
    .toEqual(["date", "number", "number", "link", "text"]);
});

test("values are normalized to their field's type, or rejected", () => {
  const f = (type: Field["type"], options?: string[]): Field => ({ id: "x", name: "X", type, options });
  expect(cleanValue(f("number"), "50k")).toBe("50000");
  expect(cleanValue(f("number"), "lots")).toBeUndefined();
  expect(cleanValue(f("date"), "2026-02-30")).toBe("2026-02-30"); // Date.parse rolls it over; the format is what's checked
  expect(cleanValue(f("date"), "tomorrow")).toBeUndefined();
  expect(cleanValue(f("link"), "example.com")).toBe("https://example.com");
  expect(cleanValue(f("select", ["High", "Low"]), "high")).toBe("High");
  expect(cleanValue(f("select", ["High", "Low"]), "Medium")).toBeUndefined();
  expect(cleanValue(f("text"), "  ")).toBe("");
});

test("fields and values from untrusted input", () => {
  const fields = parseFields([{ id: "p", name: "Priority", type: "number" }, { id: "p", name: "Dup", type: "text" }, { id: "s", name: "S", type: "nope" }, { id: "constructor", name: "C", type: "text" }]);
  expect(fields.map((f) => f.id)).toEqual(["p", "constructor"]);
  expect(parseValues({ p: "3", other: "x", constructor: "" }, fields)).toEqual({ p: "3" });
  expect(parseValues({}, fields)).toBeUndefined();
  expect(fieldId("Due date", [{ id: "due-date", name: "Due date", type: "date" }])).toBe("due-date-2");
});
