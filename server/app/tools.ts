// Built-in tools a no-code agent can switch on. By default they run inside the cua sandbox (src/sandbox.ts);
// with OPENLEO_SANDBOX=off they run on the host, with file tools confined to ./workspace.
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { defineTool } from "../infra/runtime";
import { StringEnum } from "@earendil-works/pi-ai/utils/typebox-helpers";
import { MACOS, sbComputer, sbExec, sbRead, sbWrite, shq } from "../infra/sandbox";
import { SANDBOXED } from "../infra/config";
import { htmlToText, looksLikeHtml } from "../core/html";
import { Type } from "@earendil-works/pi-ai";
import { dataDir } from "../infra/tenant";
import { boardOfCard, setCardFields } from "./boards";
import { resolve, sep } from "node:path";

/** Host-mode workspace: the current tenant's own folder. */
const workspace = () => resolve(dataDir("workspace"));

export function inWorkspace(path: string) {
  const root = workspace();
  const full = resolve(root, path);
  if (full !== root && !full.startsWith(root + sep)) throw new Error(`path escapes workspace: ${path}`);
  return full;
}

const text = (t: string) => ({ content: [{ type: "text" as const, text: t }], details: {} });
const clip = (s: string, n = 20_000) => (s.length > n ? s.slice(0, n) + `\n…(${s.length - n} more chars)` : s);

export const tools: Record<string, AgentTool<any>> = {
  bash: defineTool({
    name: "bash",
    label: "Terminal",
    description: "Run a shell command in the workspace directory. Returns stdout+stderr.",
    parameters: Type.Object({ command: Type.String() }),
    execute: async (_id, { command }, signal) => {
      if (SANDBOXED) return text(clip(await sbExec(command)));
      const proc = Bun.spawn(["bash", "-lc", command], { cwd: workspace(), stdout: "pipe", stderr: "pipe", signal });
      const [out, err, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
      return text(clip(`${out}${err}\n[exit ${code}]`));
    },
  }),
  read_file: defineTool({
    name: "read_file",
    label: "Read file",
    description: "Read a text file from the workspace.",
    parameters: Type.Object({ path: Type.String() }),
    execute: async (_id, { path }) => text(clip(SANDBOXED ? await sbRead(path) : await Bun.file(inWorkspace(path)).text())),
  }),
  write_file: defineTool({
    name: "write_file",
    label: "Write file",
    description: "Create or overwrite a text file in the workspace.",
    parameters: Type.Object({ path: Type.String(), content: Type.String() }),
    execute: async (_id, { path, content }) => {
      const n = SANDBOXED ? await sbWrite(path, content) : await Bun.write(inWorkspace(path), content);
      return text(`wrote ${n} bytes to ${path}`);
    },
  }),
  fetch_url: defineTool({
    name: "fetch_url",
    label: "Fetch URL",
    description: "Fetch a web page and return its readable text (HTML is converted to plain text; other responses are returned as-is).",
    parameters: Type.Object({ url: Type.String() }),
    execute: async (_id, { url }, signal) => {
      // In the sandbox, "localhost" is the container, not OpenLeo's own API on the host.
      let status: string, body: string;
      if (SANDBOXED) {
        const out = await sbExec(`curl -sSL --max-time 60 -w '\\nHTTP %{http_code}' -- ${shq(url)}`, 90_000);
        const i = out.lastIndexOf("\nHTTP ");
        [status, body] = i >= 0 ? [out.slice(i + 1).replace(/\s*\[exit 0\]\s*$/, ""), out.slice(0, i)] : ["", out];
      } else {
        const res = await fetch(url, { signal });
        [status, body] = [`HTTP ${res.status}`, await res.text()];
      }
      if (looksLikeHtml(body)) body = await htmlToText(body);
      return text(clip(`${status}\n${body}`.trim()));
    },
  }),
};

// Computer use: only the sandbox has a desktop (XFCE, 1280x800).
if (SANDBOXED) tools.computer = defineTool({
  name: "computer",
  label: "Computer",
  description:
    (MACOS ? "Use the sandbox's macOS desktop. " : "Use the sandbox's Linux desktop (XFCE, 1280x800). ") + "Every action returns a fresh screenshot. " +
    "Start with action=screenshot. Coordinates are pixels from the top-left. " +
    "key takes a chord like [\"ctrl\",\"l\"] or [\"Return\"]. scroll uses dy>0 to scroll down. " +
    (MACOS ? "The Dock has Finder, Safari and Terminal; on macOS the modifier key is \"cmd\"." : "The dock at the bottom has the file manager, the terminal (xfce4-terminal), the web browser and, when installed, VS Code."),
  parameters: Type.Object({
    action: StringEnum(["screenshot", "click", "double_click", "right_click", "move", "drag", "type", "key", "scroll"] as const),
    x: Type.Optional(Type.Number()),
    y: Type.Optional(Type.Number()),
    to_x: Type.Optional(Type.Number({ description: "drag end x" })),
    to_y: Type.Optional(Type.Number({ description: "drag end y" })),
    text: Type.Optional(Type.String({ description: "text for action=type" })),
    keys: Type.Optional(Type.Array(Type.String(), { description: "chord for action=key" })),
    dx: Type.Optional(Type.Number()),
    dy: Type.Optional(Type.Number()),
  }),
  executionMode: "sequential", // one mouse, one keyboard
  execute: async (_id, a) => {
    const shot = await sbComputer(a);
    return {
      content: [
        { type: "text" as const, text: `${a.action} done. Screen ${shot.width}x${shot.height}:` },
        { type: "image" as const, data: shot.jpegBase64, mimeType: "image/jpeg" },
      ],
      details: {},
    };
  },
});

/** In a task's conversation: the agent fills in the card's fields, which show on the board. */
export const cardFieldsTool = (cid: string) => defineTool({
  name: "set_card_fields",
  label: "Card fields",
  description: "Fill in fields on this task's card; people see them on the board. Keys are field names, values are text. "
    + "A name the board doesn't have yet adds that field. Use \"\" to clear a value. Dates as YYYY-MM-DD, links as URLs.",
  parameters: Type.Object({ values: Type.Record(Type.String(), Type.String()) }),
  execute: async (_id, { values }) => {
    const bid = boardOfCard(cid);
    if (!bid) throw new Error("this task's card no longer exists");
    return text(setCardFields(bid, cid, values).join("\n") || "Nothing to set.");
  },
});
