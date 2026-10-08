// Agent tools run inside cua sandboxes (https://cua.ai/docs/cua-sdk): one persistent Linux desktop per board
// (the board's "computer"), reattached by name across restarts. It has an XFCE desktop, so agents also get
// computer use. A run says which board it belongs to with inBoard(); tools then reach that board's computer.
//   OPENLEO_SANDBOX=off           run tools on the host instead (no computer use)
//   OPENLEO_SANDBOX_ON=cloud      run the sandbox in the Cua cloud (needs `bunx cua auth login` or CUA_CLIENT_ID/SECRET)
//   OPENLEO_SANDBOX_ON=apple      run it on Apple's container runtime (macOS 26+, infra/apple-container.ts)
//   OPENLEO_SANDBOX_ON=local      run it in Docker
//   unset: Apple's runtime when this Mac has it (appleAvailable), otherwise Docker
//   OPENLEO_SANDBOX_IMAGE=...     e.g. ghcr.io/trycua/linux:24.04-slim-disk for a VM instead of a container,
//                                 or ghcr.io/trycua/macos:26-slim for a macOS VM (runs on Lume, about 24 GB to download)
import { AsyncLocalStorage } from "node:async_hooks";
import { appleAddress, appleAvailable, appleComputer, stopAppleComputer } from "./apple-container";
import { MAIN_BOARD } from "../core/board";
import { computerOf } from "./board-store";
import { CLOUD_IMAGE, DOCKER_IMAGE, SANDBOX_ON_SETTING, SANDBOXED } from "./config";
import { computerSize } from "./limits";
import { currentTenant } from "./tenant";
import { embedded, ImageFormat, SandboxCreateOptions, ScreenshotOptions, ViewerOptions, type SandboxLike, type SpacesdClientLike } from "@trycua/cua";

/** Where computers run: as set, or natively on this Mac when it can, or Docker. */
export type Runtime = "apple" | "local" | "cloud";
export const pickRuntime = (on: string | undefined, apple: () => boolean): Runtime =>
  on === "cloud" || on === "apple" || on === "local" ? on : apple() ? "apple" : "local";
export let SANDBOX_ON: Runtime = pickRuntime(SANDBOX_ON_SETTING, appleAvailable);
/** Choose again after setup on this Mac (Apple's tool turned on, its image built); failed computers retry on next use. */
export const repickRuntime = () => { SANDBOX_ON = pickRuntime(SANDBOX_ON_SETTING, appleAvailable); };
export const MACOS = DOCKER_IMAGE.includes("/macos:");
export const GUEST_HOME = MACOS ? "/Users/lume" : "/home/openleo";
export const GUEST_WORKSPACE = `${GUEST_HOME}/workspace`;

const boardScope = new AsyncLocalStorage<string>();

/** Run `fn` (and every tool call it makes, however deep) against `board`'s computer. */
export const inBoard = <T>(board: string, fn: () => T) => boardScope.run(board, fn);
export const currentBoard = () => boardScope.getStore() ?? MAIN_BOARD;

export type ComputerState = { state: "off" | "starting" | "running" | "error"; name: string; error?: string };
// Keyed by "<tenant>/<board>": the same board id in two accounts is two different computers.
type Computer = { sb: SandboxLike; sp: SpacesdClientLike; address?: string }; // address: Apple computers only
const handles = new Map<string, Promise<Computer>>();
const states = new Map<string, ComputerState>();
const keyOf = (board: string) => `${currentTenant()}/${board}`;
export const computerState = (board: string): ComputerState => states.get(keyOf(board)) ?? { state: "off", name: computerOf(board) };

/** The computer's control service. A new computer takes a few seconds to start it, so keep asking for up to a minute. */
async function spacesdOf(sb: SandboxLike): Promise<SpacesdClientLike> {
  for (let tries = 1; ; tries++) {
    try { return await sb.spacesd(undefined); }
    catch (e) { if (tries >= 20) throw e; await Bun.sleep(3000); }
  }
}

/** Attach to the named computer, creating it on first use. */
async function attach(name: string): Promise<Omit<Computer, "sp">> {
  if (SANDBOX_ON === "apple") return appleComputer(name);
  const sbs = embedded().sandboxes();
  return { sb: await sbs.connect(`${SANDBOX_ON}:${name}`).catch(() =>
    sbs.create(SandboxCreateOptions.create({ on: SANDBOX_ON, image: SANDBOX_ON === "cloud" ? CLOUD_IMAGE : DOCKER_IMAGE, name, ...computerSize() }))) };
}

const HINTS = { apple: "run `container system start`", cloud: "run `bunx cua auth login`", local: "is Docker/Colima running?" };

/** Connect to (or create on first use) a board's computer, for the current tenant. Retries on the next call if it fails. */
export function sandbox(board = currentBoard()) {
  const key = keyOf(board);
  let handle = handles.get(key);
  if (handle) return handle;
  const name = computerOf(board);
  states.set(key, { state: "starting", name });
  handle = (async () => {
    const { sb, address } = await attach(name);
    const sp = await spacesdOf(sb);
    await sp.sh(`mkdir -p ${GUEST_WORKSPACE}`, 30_000);
    states.set(key, { state: "running", name });
    return { sb, sp, address };
  })().catch((e) => {
    handles.delete(key);
    const error = `computer unavailable (${HINTS[SANDBOX_ON]}): ${(e as Error).message}`;
    states.set(key, { state: "error", name, error });
    throw new Error(error);
  });
  handles.set(key, handle);
  return handle;
}

/** Pause a board's computer (its files stay; cua's own tools can erase it for good). */
export async function pauseComputer(board: string) {
  const key = keyOf(board);
  const handle = handles.get(key);
  handles.delete(key);
  states.delete(key);
  const live = await handle?.catch(() => null);
  if (SANDBOX_ON === "apple") await stopAppleComputer(computerOf(board)).catch(() => {});
  else await live?.sb.suspend().catch(() => {});
}

/**
 * Use the current board's computer. An Apple computer gets a new address when it restarts behind our back
 * (its service restarted, it crashed), so when a call fails and the address has moved, reconnect and try once more.
 */
async function withComputer<T>(fn: (c: Computer) => Promise<T>): Promise<T> {
  const board = currentBoard(), key = keyOf(board);
  const handle = sandbox(board), c = await handle;
  try { return await fn(c); }
  catch (e) {
    if (!c.address || (await appleAddress(computerOf(board)).catch(() => c.address)) === c.address) throw e;
    if (handles.get(key) === handle) handles.delete(key); // another call may already have reconnected
    return fn(await sandbox(board));
  }
}

const decode = (b: ArrayBuffer) => new TextDecoder().decode(b);
export const shq = (s: string) => `'${s.replaceAll("'", `'\\''`)}'`;

/** Guest path: relative paths live under the workspace. The sandbox is the isolation boundary. */
export const guestPath = (p: string) => (p.startsWith("/") ? p : `${GUEST_WORKSPACE}/${p}`);

export async function sbExec(command: string, timeoutMs = 120_000) {
  const out = await withComputer(({ sp }) => sp.sh(`cd ${GUEST_WORKSPACE} && ${command}`, timeoutMs));
  const code = out.exit.timedOut ? "timed out" : `exit ${out.exit.code ?? out.exit.signal}`;
  return `${decode(out.stdout)}${decode(out.stderr)}\n[${code}]`;
}

export async function sbRead(path: string) {
  return decode(await withComputer(({ sp }) => sp.download(guestPath(path))));
}

/** A file's bytes, as they are (pictures, documents). */
export async function sbReadBytes(path: string) {
  return new Uint8Array(await withComputer(({ sp }) => sp.download(guestPath(path))));
}

export async function sbWrite(path: string, content: string) {
  const p = guestPath(path);
  const bytes = new TextEncoder().encode(content);
  await withComputer(async ({ sp }) => {
    await sp.sh(`mkdir -p "$(dirname ${shq(p)})"`, 30_000);
    await sp.upload(p, bytes.buffer as ArrayBuffer, undefined);
  });
  return bytes.length;
}

// ---- Computer use ----

export type ComputerAction = {
  action: "screenshot" | "click" | "double_click" | "right_click" | "move" | "drag" | "type" | "key" | "scroll";
  x?: number; y?: number; to_x?: number; to_y?: number; text?: string; keys?: string[]; dx?: number; dy?: number;
};

/** Reject if `p` takes longer than `ms` (a hung desktop action becomes an error the agent can recover from). */
function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  let t: ReturnType<typeof setTimeout>;
  return Promise.race([p, new Promise<never>((_, rej) => { t = setTimeout(() => rej(new Error(`${what} timed out after ${Math.round(ms / 1000)}s`)), ms); })])
    .finally(() => clearTimeout(t));
}

/** Typing takes longer for long text; everything else gets a flat limit. */
export const actionTimeoutMs = (a: ComputerAction) => (a.action === "type" ? Math.min(120_000, 15_000 + (a.text?.length ?? 0) * 60) : 30_000);

/** Run one desktop action (mouse/keyboard), with a timeout. */
export const sbAct = (a: ComputerAction) => withComputer(({ sp }) => withTimeout(runAction(sp, a), actionTimeoutMs(a), a.action));

async function runAction(sp: SpacesdClientLike, a: ComputerAction) {
  const need = (...v: (number | undefined)[]) => {
    if (v.some((n) => typeof n !== "number")) throw new Error(`${a.action} needs coordinates`);
    return v as number[];
  };
  switch (a.action) {
    case "screenshot": break;
    case "click": await sp.click(...(need(a.x, a.y) as [number, number])); break;
    case "double_click": await sp.doubleClick(...(need(a.x, a.y) as [number, number])); break;
    case "right_click": await sp.rightClick(...(need(a.x, a.y) as [number, number])); break;
    case "move": await sp.moveTo(...(need(a.x, a.y) as [number, number])); break;
    case "drag": await sp.drag(...(need(a.x, a.y, a.to_x, a.to_y) as [number, number, number, number])); break;
    case "type": if (!a.text) throw new Error("type needs text"); await sp.typeText(a.text); break;
    case "key": if (!a.keys?.length) throw new Error("key needs keys, e.g. [\"ctrl\",\"l\"]"); await sp.hotkey(a.keys); break;
    case "scroll": await sp.scroll(a.dx ?? 0, a.dy ?? 0); break;
  }
}

/** Run one desktop action, then return a fresh screenshot (JPEG) so the model sees the result. */
export async function sbComputer(a: ComputerAction) {
  await sbAct(a);
  if (a.action !== "screenshot") await Bun.sleep(400); // let the UI settle before looking
  const shot = await sbScreenshot();
  return { width: shot.width, height: shot.height, jpegBase64: Buffer.from(shot.image).toString("base64") };
}

export async function sbScreenshot() {
  return withComputer(({ sp }) =>
    withTimeout(sp.screenshot(ScreenshotOptions.create({ format: ImageFormat.Jpeg, quality: 70, includeCursor: true })), 15_000, "screenshot"));
}

/** Short-lived browser link to the live desktop (video + input). It is a capability URL: don't log it. */
export async function sbViewerUrl() {
  const link = await withComputer(({ sb }) => sb.viewerUrl(ViewerOptions.create({ ttlSeconds: 3600 })));
  return link.url;
}
