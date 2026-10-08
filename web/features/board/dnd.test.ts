import { expect, test } from "bun:test";
import { attachClosestEdge, extractClosestEdge } from "./dnd";

test("closest edge picks the nearest allowed edge", () => {
  const element = { getBoundingClientRect: () => ({ top: 100, bottom: 200, left: 0, right: 300 }) } as unknown as Element;
  const at = (clientY: number, clientX = 150) => extractClosestEdge(attachClosestEdge({ id: "x" }, { input: { clientX, clientY }, element, allowedEdges: ["top", "bottom"] }));
  expect(at(110)).toBe("top");
  expect(at(190)).toBe("bottom");
  const lr = attachClosestEdge({}, { input: { clientX: 280, clientY: 150 }, element, allowedEdges: ["left", "right"] });
  expect(extractClosestEdge(lr)).toBe("right");
  expect(extractClosestEdge({})).toBeNull();
});
