import { expect, test } from "bun:test";
import { computersWork } from "./computers";

test("computers work once their runtime is set up: Apple's tool or Docker running with OpenLeo's computer built", () => {
  const mac = (apple: [boolean, boolean], docker: [boolean, boolean]) => ({ apple: { installed: true, running: apple[0], image: apple[1] }, docker: { installed: true, running: docker[0], windows: false, image: docker[1] } });
  expect(computersWork("apple", mac([true, true], [false, false]))).toBe(true);
  expect(computersWork("apple", mac([true, false], [true, true]))).toBe(false); // no image yet: Docker doesn't help this runtime
  expect(computersWork("local", mac([false, false], [true, true]))).toBe(true);
  expect(computersWork("local", mac([false, false], [true, false]))).toBe(false); // Docker on, OpenLeo's computer not built yet
  expect(computersWork("cloud", mac([false, false], [false, false]))).toBe(true);
});
