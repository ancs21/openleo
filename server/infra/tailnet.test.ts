import { expect, test } from "bun:test";
import { fromOwnersDevice, noteVisitor, setListening, viaTailnet } from "./tailnet";

test("only visits Tailscale names as the owner's account count as the owner's devices", () => {
  const visit = (login?: string) => { const req = new Request("https://my-mac.tail1234.ts.net/api/me"); noteVisitor(req, login); return req; };
  const local = new Request("http://127.0.0.1:3000/api/me");
  setListening({ login: "me@example.com", origin: "https://my-mac.tail1234.ts.net" });
  expect(fromOwnersDevice(visit("me@example.com"))).toBe(true);
  expect(fromOwnersDevice(visit("friend@example.com"))).toBe(false); // someone the network is shared with
  expect(fromOwnersDevice(visit(undefined))).toBe(false); // Tailscale couldn't say, or this computer itself
  expect(fromOwnersDevice(local)).toBe(false); // came in on 127.0.0.1, whatever its headers say
  expect(viaTailnet(visit("me@example.com"))).toBe(true);
  expect(viaTailnet(local)).toBe(false);
  setListening(undefined);
  expect(fromOwnersDevice(visit("me@example.com"))).toBe(false); // sharing off
});
