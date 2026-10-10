// Everything else the app asks for: models, site icons, skills and apps (MCP), usage limits, agent icons, wallpapers.
import { listDefs } from "../app/agents";
import { listBoards } from "../app/boards";
import { dropSessions, runningCount } from "../app/live-agents";
import { pickIcon } from "../app/pick-icon";
import { previewSkill, searchSkills } from "../app/skills";
import { favicon } from "../infra/favicon";
import { storageBytes, unlimited } from "../infra/limits";
import { LIMITS } from "../infra/config";
import { deleteMcp, listMcp, parseMcpConfig, saveMcp } from "../infra/mcp";
import { models } from "../infra/runtime";
import { inBoard } from "../infra/sandbox";
import { searchWallpapers, trackDownload } from "../infra/unsplash";
import { safe } from "./guard";
import mcpDirectory from "./mcp-directory.json";

export const settingsRoutes = {
  // With an in-app "openai" sign-in, hide "openai-codex": same models in the picker, and that login can expire.
  "/api/models": async () => {
    const all = await models().getAvailable();
    const signedIn = all.some((m) => m.provider === "openai");
    return Response.json(all.filter((m) => !(signedIn && m.provider === "openai-codex")).map((m) => `${m.provider}/${m.id}`));
  },
  "/api/favicon/:host": async (req: Bun.BunRequest<"/api/favicon/:host">) => {
    const icon = await favicon(req.params.host.toLowerCase());
    return icon
      ? new Response(icon.bytes as Uint8Array<ArrayBuffer>, { headers: { "content-type": icon.type, "cache-control": "public, max-age=604800", "x-content-type-options": "nosniff",
          // A site's SVG could carry script: opened on its own, it runs nothing.
          "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox" } })
      : new Response(null, { status: 404, headers: { "cache-control": "public, max-age=86400" } });
  },
  "/api/skills/search": safe(async (req) => Response.json(await searchSkills(new URL(req.url).searchParams.get("q")?.slice(0, 200) ?? "")), 502),
  "/api/skills/preview": safe(async (req) => Response.json(await previewSkill(new URL(req.url).searchParams.get("id") ?? "")), 502),
  "/api/limits": () => Response.json({
    unlimited: unlimited(),
    boards: { used: listBoards().length, max: LIMITS.boards },
    runs: { used: runningCount(), max: LIMITS.runs },
    storageMb: { used: Math.ceil(storageBytes() / 1024 / 1024), max: LIMITS.storageMb },
    computer: { cpus: LIMITS.computerCpus, memoryMb: LIMITS.computerMemoryMb },
  }),
  "/api/mcp": async () => Response.json(await listMcp()),
  "/api/mcp-directory": () => Response.json(mcpDirectory),
  "/api/icon": { POST: safe(async (req) => Response.json({ icon: (await pickIcon(String(((await req.json()) as any).text ?? ""))) ?? null }), 502) },
  "/api/mcp/:name": {
    PUT: safe(async (req: Bun.BunRequest<"/api/mcp/:name">) => {
      const info = await saveMcp(req.params.name, parseMcpConfig(await req.json()));
      for (const b of listBoards()) inBoard(b.id, () => { for (const def of listDefs()) if (def.mcp?.includes(info.name)) dropSessions(def.name); }); // pick up the new tool list
      return Response.json(info);
    }),
    DELETE: async (req: Bun.BunRequest<"/api/mcp/:name">) => { await deleteMcp(req.params.name); return new Response(null, { status: 204 }); },
  },
  "/api/wallpapers": safe(async (req) => {
    const u = new URL(req.url);
    return Response.json(await searchWallpapers(u.searchParams.get("q") ?? "", u.searchParams.get("theme") === "light" ? "light" : "dark"));
  }, 502),
  "/api/wallpapers/use": { POST: safe(async (req) => { await trackDownload(String(((await req.json()) as any).downloadLocation ?? "")); return new Response(null, { status: 204 }); }) },
};
