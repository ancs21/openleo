// MCP servers ("connected apps"): config in <tenant>/mcp.json, header values in the vault. Each server is connected
// once and its tools cached, so agents can be built synchronously. Tools are named "<server>__<tool>".
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { writePrivate } from "./private-file";
import type { McpServerInfo } from "../../shared/types";
import { currentTenant, dataDir } from "./tenant";
import { vaultDelete, vaultGet, vaultSet } from "./vault";

/** `headers` is only in memory (from the form or the vault); on disk there's `headerNames`. */
export type McpConfig = { url?: string; headers?: Record<string, string>; headerNames?: string[]; command?: string; args?: string[] };
type Live = { client?: Client; tools: AgentTool<any>[]; error?: string };

export const MCP_NAME = /^[a-z0-9][a-z0-9-]{0,30}$/;
const file = () => `${dataDir()}/mcp.json`;
const live = new Map<string, Live>(); // "<tenant>/<server>"
const key = (name: string) => `${currentTenant()}/${name}`;

const secretKey = (name: string) => `mcp/${name}`;

async function readAll(): Promise<Record<string, McpConfig>> {
  const all: Record<string, McpConfig> = (await Bun.file(file()).exists()) ? await Bun.file(file()).json() : {};
  // Keys saved in the file before the vault existed move into it.
  const plain = Object.entries(all).filter(([, c]) => c.headers && Object.keys(c.headers).length);
  if (!plain.length) return all;
  for (const [name, c] of plain) {
    await vaultSet(currentTenant(), secretKey(name), JSON.stringify(c.headers));
    all[name] = { ...c, headers: undefined, headerNames: Object.keys(c.headers!) };
  }
  await writeAll(all);
  return all;
}

const headersOf = async (name: string, cfg: McpConfig) =>
  cfg.headers ?? (cfg.headerNames?.length ? (JSON.parse((await vaultGet(currentTenant(), secretKey(name))) ?? "{}") as Record<string, string>) : undefined);
const writeAll = (all: Record<string, McpConfig>) => writePrivate(file(), JSON.stringify(all, null, 2));

function toAgentTool(server: string, client: Client, t: { name: string; title?: string; description?: string; inputSchema?: object }): AgentTool<any> {
  return {
    name: `${server}__${t.name}`.replace(/[^\w-]/g, "_").slice(0, 64),
    label: t.title ?? t.name,
    description: t.description ?? "",
    parameters: (t.inputSchema ?? { type: "object", properties: {} }) as any,
    execute: async (_id, args, signal) => {
      const r: any = await client.callTool({ name: t.name, arguments: args as Record<string, unknown> }, undefined, { signal });
      const content = (r.content ?? []).map((c: any) =>
        c.type === "text" ? { type: "text", text: c.text }
        : c.type === "image" ? { type: "image", data: c.data, mimeType: c.mimeType }
        : { type: "text", text: JSON.stringify(c) });
      if (r.isError) throw new Error(content.map((c: any) => c.text ?? "").join("\n") || `${t.name} failed`);
      return { content: content.length ? content : [{ type: "text", text: JSON.stringify(r.structuredContent ?? "(no output)") }], details: {} };
    },
  };
}

async function connect(name: string, cfg: McpConfig) {
  const k = key(name);
  await live.get(k)?.client?.close().catch(() => {});
  const client = new Client({ name: "openleo", version: "0.1.0" });
  const headers = await headersOf(name, cfg);
  const transport = cfg.url
    ? new StreamableHTTPClientTransport(new URL(cfg.url), { requestInit: { headers } })
    : new StdioClientTransport({ command: cfg.command!, args: cfg.args ?? [], stderr: "ignore" });
  try {
    await client.connect(transport);
    const { tools } = await client.listTools();
    live.set(k, { client, tools: tools.map((t) => toAgentTool(name, client, t)) });
  } catch (e) {
    live.set(k, { tools: [], error: (e as Error).message });
    await client.close().catch(() => {});
  }
}

export async function startMcp() {
  const all = await readAll();
  await Promise.all(Object.entries(all).map(([name, cfg]) => connect(name, cfg)));
}

export async function listMcp(): Promise<McpServerInfo[]> {
  return Object.entries(await readAll()).map(([name, cfg]) => {
    const l = live.get(key(name));
    return {
      name,
      url: cfg.url,
      command: cfg.command ? [cfg.command, ...(cfg.args ?? [])].join(" ") : undefined,
      headerNames: cfg.headerNames ?? [],
      connected: !!l?.client,
      error: l?.error,
      tools: (l?.tools ?? []).map((t) => ({ name: t.name, label: t.label, description: t.description })),
    };
  });
}

export function parseMcpConfig(body: any): McpConfig {
  if (typeof body?.url === "string" && body.url.trim()) {
    const url = new URL(body.url.trim());
    if (!/^https?:$/.test(url.protocol)) throw new Error("the address must start with https:// or http://");
    const headers = Object.fromEntries(Object.entries(body.headers ?? {}).filter(([k, v]) => typeof v === "string" && v && /^[\w-]+$/.test(k))) as Record<string, string>;
    return { url: url.toString(), ...(Object.keys(headers).length ? { headers } : {}) };
  }
  if (typeof body?.command === "string" && body.command.trim()) {
    const [command, ...args] = body.command.trim().split(/\s+/);
    return { command, args };
  }
  throw new Error("give a web address or a command");
}

export async function saveMcp(name: string, cfg: McpConfig) {
  if (!MCP_NAME.test(name)) throw new Error("name must be lowercase letters, digits, dashes");
  const { headers, ...rest } = cfg;
  if (headers && Object.keys(headers).length) await vaultSet(currentTenant(), secretKey(name), JSON.stringify(headers));
  else await vaultDelete(currentTenant(), secretKey(name));
  await writeAll({ ...(await readAll()), [name]: { ...rest, headerNames: Object.keys(headers ?? {}) } });
  await connect(name, cfg);
  return (await listMcp()).find((s) => s.name === name)!;
}

export async function deleteMcp(name: string) {
  const { [name]: _, ...rest } = await readAll();
  await writeAll(rest);
  await vaultDelete(currentTenant(), secretKey(name));
  await live.get(key(name))?.client?.close().catch(() => {});
  live.delete(key(name));
}

export const mcpToolsFor = (names: string[]) => names.flatMap((n) => live.get(key(n))?.tools ?? []);
