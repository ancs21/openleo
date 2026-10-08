// A board's agents and their chats, plus Leo's settings and drafting a new agent. Every board route here runs
// inside the board in its URL: agents, their chats and skills belong to it.
import { EFFORTS, type Effort } from "../../shared/types";
import { deleteDef, draftDef, listDefs, loadDef, NAME, saveDef } from "../app/agents";
import { listBoards } from "../app/boards";
import { LEO } from "../app/leo";
import { leoSettings, setLeoSettings } from "../infra/leo-settings";
import { compactIfLong, compactNow, getSession, isBusy, liveAgent, retune, runningCount, skey, stopSession } from "../app/live-agents";
import { agentSkills, syncIfRunning } from "../app/skills";
import { searchSummary, toChatMessages } from "../core/history";
import { loadConversation, saveConversation } from "../infra/conversations";
import { checkRuns, checkStorage } from "../infra/limits";
import { onWebSearch, resolveModel } from "../infra/runtime";
import { inBoard } from "../infra/sandbox";
import { SANDBOXED } from "../infra/config";
import { CONVERSATION, err, onBoard, parseImages, safe } from "./guard";

/** Send a message and stream the reply as server-sent events: text, reasoning, tool calls and their results. */
function chat(name: string, session: string, message: string, images: ReturnType<typeof parseImages> = []) {
  const agent = getSession(name, session);
  const key = skey(name, session);
  if (isBusy(name, session)) return err(new Error("Still working on the previous message. Press Stop to interrupt it."), 409);
  try { checkRuns(runningCount()); checkStorage(); } catch (e) { return err(e, 429); }

  const enc = new TextEncoder();
  let off = () => {};
  let closed = false;
  const stream = new ReadableStream({
    async start(ctrl) {
      const send = (data: object) => { if (!closed) ctrl.enqueue(enc.encode(`data: ${JSON.stringify(data)}\n\n`)); };
      const offSearch = onWebSearch(agent, (e) => e.phase === "start"
        ? send({ type: "tool", id: e.id, name: "web_search", args: {} })
        : send({ type: "tool_result", id: e.id, name: "web_search", isError: false, args: e.action, text: searchSummary(e.action) }));
      const offEvents = agent.subscribe((e: any) => {
        const d = e.type === "message_update" ? e.assistantMessageEvent : null;
        if (d?.type === "text_delta") send({ type: "text", delta: d.delta });
        else if (d?.type === "thinking_delta") send({ type: "reasoning", delta: d.delta });
        else if (e.type === "tool_execution_start") send({ type: "tool", id: e.toolCallId, name: e.toolName, args: e.args });
        else if (e.type === "tool_execution_end") {
          const content: any[] = e.result?.content ?? [];
          const img = content.find((c) => c.type === "image");
          send({
            type: "tool_result", id: e.toolCallId, name: e.toolName, isError: e.isError,
            text: content.map((c) => c.text ?? "").join("").slice(0, 2000),
            image: img ? `data:${img.mimeType};base64,${img.data}` : undefined, // computer-use screenshot for the UI
          });
        }
      });
      off = () => { offEvents(); offSearch(); };
      try {
        if (await compactIfLong(name, key, agent)) send({ type: "compacted" });
        await agent.prompt(message, images); // already inside the board (the route runs in it)
        if (agent.state.errorMessage) send({ type: "error", message: agent.state.errorMessage });
      } catch (e) {
        send({ type: "error", message: (e as Error).message });
      } finally {
        off();
        void saveConversation(name, session, agent.state.messages);
        send({ type: "done" });
        if (!closed) ctrl.close();
      }
    },
    // Closing or reloading the page only detaches: the run keeps going and the history shows it.
    // Stopping is explicit (POST …/stop).
    cancel: () => { closed = true; off(); },
  });
  return new Response(stream, { headers: { "content-type": "text/event-stream", "cache-control": "no-cache" } });
}

export const agentRoutes = {
  "/api/agents/draft": {
    POST: safe(async (req) => {
      const { description, model } = (await req.json()) as any;
      if (typeof description !== "string" || !description.trim()) throw new Error("describe the agent first");
      resolveModel(String(model)); // throws on unknown models
      return Response.json(await draftDef(description.slice(0, 4000), String(model)));
    }, 502),
  },
  // Leo's model and thinking time (it isn't one of the user's agents, so it isn't saved with them).
  "/api/leo": {
    GET: () => Response.json(leoSettings()),
    PUT: safe(async (req) => {
      const body = (await req.json()) as any;
      const settings = { ...leoSettings(), ...(body.model ? { model: String(body.model) } : {}), ...(EFFORTS.includes(body.effort) ? { effort: body.effort as Effort } : {}) };
      resolveModel(settings.model); // throws on unknown models
      await setLeoSettings(settings);
      for (const b of listBoards()) inBoard(b.id, () => retune(LEO, settings.model, settings.effort)); // its chats on every board carry on with the new settings
      return Response.json(leoSettings());
    }),
  },
  "/api/boards/:board/agents": {
    GET: safe(onBoard(() => Response.json(listDefs())), 404),
  },
  // Install an agent's skills now, in its board's computer if that's on (otherwise on the agent's first run).
  "/api/boards/:board/agents/:name/skills": {
    POST: safe(onBoard(async (req: Bun.BunRequest<"/api/boards/:board/agents/:name/skills">) => {
      const def = loadDef(req.params.name);
      return Response.json(SANDBOXED ? await syncIfRunning(def.name, agentSkills(def.skills)) : { installed: false, failed: [] });
    })),
  },
  "/api/boards/:board/agents/:name": {
    GET: safe(onBoard((req: Bun.BunRequest<"/api/boards/:board/agents/:name">) => Response.json(loadDef(req.params.name))), 404),
    PUT: safe(onBoard(async (req: Bun.BunRequest<"/api/boards/:board/agents/:name">) => Response.json(await saveDef(await req.json(), req.params.name)))),
    DELETE: safe(onBoard((req: Bun.BunRequest<"/api/boards/:board/agents/:name">) => {
      deleteDef(req.params.name);
      return new Response(null, { status: 204 });
    })),
  },
  // Summarize older turns now (the chat's /compact command).
  "/api/boards/:board/agents/:name/:conversation/compact": {
    POST: safe(onBoard(async (req: Bun.BunRequest<"/api/boards/:board/agents/:name/:conversation/compact">) => {
      const { name, conversation } = req.params;
      if (!CONVERSATION.test(conversation)) throw new Error("bad conversation id");
      if (isBusy(name, conversation)) return err(new Error("Still working. Try again when the run finishes."), 409);
      await compactNow(name, conversation);
      return new Response(null, { status: 204 });
    }), 502),
  },
  "/api/boards/:board/agents/:name/:conversation/stop": {
    POST: safe(onBoard((req: Bun.BunRequest<"/api/boards/:board/agents/:name/:conversation/stop">) => {
      stopSession(req.params.name, req.params.conversation);
      return new Response(null, { status: 204 });
    })),
  },
  // One conversation per URL.
  "/api/boards/:board/agents/:name/:conversation": {
    // History of a conversation (in memory, else saved on disk).
    GET: safe(onBoard((req: Bun.BunRequest<"/api/boards/:board/agents/:name/:conversation">) => {
      const { name, conversation } = req.params;
      if (!NAME.test(name) || !CONVERSATION.test(conversation)) return Response.json({ messages: [], running: false });
      const agent = liveAgent(name, conversation);
      const transcript = agent?.state.messages ?? loadConversation(name, conversation) ?? [];
      const running = !!agent?.state.isStreaming;
      return Response.json({ messages: toChatMessages(transcript as any, running), running });
    }), 404),
    POST: safe(onBoard(async (req: Bun.BunRequest<"/api/boards/:board/agents/:name/:conversation">) => {
      const { message, images = [] } = (await req.json()) as any;
      if (typeof message !== "string" || !message.trim()) throw new Error("message required");
      const imgs = parseImages(images);
      if (!CONVERSATION.test(req.params.conversation)) throw new Error("bad conversation id");
      loadDef(req.params.name);
      return chat(req.params.name, req.params.conversation, message, imgs);
    })),
  },
};
