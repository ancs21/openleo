// OpenLeo's server: AI agents on a board, no code. This file wires the layers together and starts listening.
//   core/   rules on plain data (boards, GitHub rows, wallpapers, chat history); no I/O
//   app/    use cases: agents and their chats, card runs, Leo, notes, skills
//   infra/  files, the vault, sign-in, computers, models, GitHub, Unsplash, settings (infra/config.ts)
//   http/   routes; every route but signing in needs a session and runs as that account (http/guard.ts)
// Inner layers never import outer ones (layers.test.ts).
import { registerBunOAuthFlows } from "@earendil-works/pi-ai/bun-oauth";
import index from "../web/index.html";
import { startComputers } from "./app/computers";
import { runDueSchedules } from "./app/tasks";
import { moveAgentsToBoards } from "./infra/agent-store";
import { exposureProblem, HOST, PORT, PUBLIC_ORIGIN, SANDBOXED, TLS } from "./infra/config";
import { startMcp } from "./infra/mcp";
import { inTenant, listTenants, moveOldData } from "./infra/tenant";
import { agentRoutes } from "./http/agents";
import { authRoutes } from "./http/auth";
import { boardRoutes } from "./http/boards";
import { computerRoutes, viewerSocket } from "./http/computer";
import { githubRoutes } from "./http/github";
import { protect } from "./http/guard";
import { remoteRoutes, serveOnTailnet } from "./http/remote";
import { settingsRoutes } from "./http/settings";

// Sign-in flows load from files next to pi-ai, which a compiled app doesn't have: use the bundled copies.
registerBunOAuthFlows();
moveOldData();

// Agents can run commands: never listen beyond this machine without HTTPS (see infra/config.ts).
const exposure = exposureProblem();
if (exposure) { console.error(exposure); process.exit(1); }

const routes = protect({
  "/": index,
  "/login": index,
  "/agents/*": index, // client routes (React Router)
  "/card/*": index,
  "/b/*": index,
  ...authRoutes,
  ...boardRoutes,
  ...agentRoutes,
  ...githubRoutes,
  ...computerRoutes,
  ...settingsRoutes,
  ...remoteRoutes,
});

const server = Bun.serve({
  port: PORT,
  hostname: HOST,
  ...(TLS ? { tls: TLS } : {}),
  // Production (`bun run start`, the Mac app): pages are bundled once, minified, with React's production build.
  development: process.env.NODE_ENV !== "production",
  idleTimeout: 0, // agent runs can be long
  routes,
  websocket: viewerSocket,
});
// The same app on this computer's Tailscale address, when the owner turned that on (http/remote.ts).
void serveOnTailnet(routes);

console.log(`OpenLeo on ${PUBLIC_ORIGIN}${HOST === "127.0.0.1" ? "" : ` (listening on ${HOST}:${server.port})`}`);
// Computers stay on: at launch, start every board's computer and connect every app, for every tenant.
for (const tenant of listTenants()) inTenant(tenant, () => { moveAgentsToBoards(); startComputers(); void startMcp(); });
// Schedules: check every 30 s. One timer even across hot reloads in development.
const g = globalThis as { openleoSchedules?: ReturnType<typeof setInterval> };
clearInterval(g.openleoSchedules);
g.openleoSchedules = setInterval(runDueSchedules, 30_000);
if (!SANDBOXED) console.warn("OPENLEO_SANDBOX=off: tools run on this machine");
