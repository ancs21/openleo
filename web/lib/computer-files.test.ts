import { expect, test } from "bun:test";
import { computerPath, fileKind, fileUrl } from "./computer-files";

test("links to files in the board's computer are recognised, web links are not", () => {
  expect(computerPath("sandbox:/mnt/data/chart.png")).toBe("/mnt/data/chart.png");
  expect(computerPath("file:///home/openleo/workspace/a%20b.md")).toBe("/home/openleo/workspace/a b.md");
  expect(computerPath("/home/openleo/workspace/out.csv")).toBe("/home/openleo/workspace/out.csv");
  expect(computerPath("https://example.com/a.png")).toBeUndefined();
  expect(computerPath("/b/main/agents")).toBeUndefined(); // the app's own pages
  expect(computerPath("sandbox:relative.txt")).toBeUndefined();
});

test("a file opens as a picture, a document, text, or a download", () => {
  expect(fileKind("/x/chart.PNG")).toBe("image");
  expect(fileKind("/x/chart.svg")).toBe("image");
  expect(fileKind("/x/report.pdf")).toBe("pdf");
  expect(fileKind("/x/render.py")).toBe("text");
  expect(fileKind("/x/archive.zip")).toBe("other");
  expect(fileUrl("hola", "/mnt/data/a b.png")).toBe("/api/boards/hola/computer/file?path=%2Fmnt%2Fdata%2Fa%20b.png");
});
