// Hook over the SSE chat stream: history first, then live message parts.
import { useCallback, useEffect, useRef, useState } from "react";

import type { FilePart, Message, Part, ToolPart } from "../../../shared/types";
export type { FilePart, Message, Part, ToolPart };
export type Status = "ready" | "submitted" | "streaming" | "error";

export function useAgent({ url }: { url?: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [status, setStatus] = useState<Status>("ready");
  const [error, setError] = useState<string>();
  const [historyReady, setHistoryReady] = useState(false);
  const abort = useRef<AbortController | null>(null);

  // Load the conversation's history first. If a run is still going (e.g. after a reload), show it as
  // working and refresh the history until it settles; live events take over when you send a message.
  const poll = useRef<ReturnType<typeof setTimeout>>(undefined);
  const loadHistory = useCallback(async (signal?: AbortSignal) => {
    if (!url) return;
    clearTimeout(poll.current);
    // Aborted (the chat closed or switched) during the request or while reading the body: just stop.
    const h = await fetch(url, { signal }).then((r) => (r.ok ? (r.json() as Promise<{ messages: Message[]; running: boolean }>) : null)).catch(() => null);
    if (!h || signal?.aborted) return;
    setMessages(h.messages);
    setHistoryReady(true);
    if (h.running) { setStatus("streaming"); poll.current = setTimeout(() => void loadHistory(signal), 2000); }
    else setStatus((s) => (s === "streaming" && !abort.current ? "ready" : s));
  }, [url]);

  useEffect(() => {
    setMessages([]); setStatus("ready"); setError(undefined); setHistoryReady(false);
    const ctrl = new AbortController();
    abort.current = null;
    void loadHistory(ctrl.signal);
    return () => { ctrl.abort(); clearTimeout(poll.current); abort.current?.abort(); };
  }, [loadHistory]);

  const apply = (e: any) =>
    setMessages((all) => {
      const last = all.at(-1)!;
      const parts = [...last.parts];
      const tail = parts.at(-1);
      if (e.type === "text" || e.type === "reasoning") {
        if (tail && (tail.type === "text" || tail.type === "reasoning") && tail.type === e.type) parts[parts.length - 1] = { ...tail, text: tail.text + e.delta };
        else parts.push({ type: e.type, text: e.delta });
      } else if (e.type === "tool") {
        parts.push({ type: "dynamic-tool", toolCallId: e.id, toolName: e.name, input: e.args, state: "input-available" });
      } else if (e.type === "tool_result") {
        const i = parts.findIndex((p) => p.type === "dynamic-tool" && p.toolCallId === e.id);
        if (i >= 0) {
          const part = parts[i] as ToolPart;
          parts[i] = { ...part, input: e.args ?? part.input, state: e.isError ? "output-error" : "output-available", output: e.text, image: e.image };
        }
      }
      return [...all.slice(0, -1), { ...last, parts }];
    });

  const sendMessage = useCallback(
    async (text: string, images: string[] = []) => {
      if (!url || !text.trim()) return;
      clearTimeout(poll.current);
      const ctrl = (abort.current = new AbortController());
      setError(undefined);
      setStatus("submitted");
      setMessages((all) => [
        ...all,
        { id: crypto.randomUUID(), role: "user", parts: [{ type: "text", text }, ...images.map((u): FilePart => ({ type: "file", url: u, mediaType: u.slice(5, u.indexOf(";")) }))] },
        { id: crypto.randomUUID(), role: "assistant", parts: [], startedAt: Date.now() },
      ]);
      try {
        const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: text, images }), signal: ctrl.signal });
        if (res.status === 409) {
          // A run is still going: drop the optimistic messages and follow that run instead.
          setMessages((all) => all.slice(0, -2));
          setError((await res.json().catch(() => ({}))).error);
          abort.current = null;
          return void loadHistory();
        }
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
        setStatus("streaming");
        const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
        let buf = "", failed: string | undefined, compacted = false;
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += value;
          const events = buf.split("\n\n");
          buf = events.pop()!;
          for (const raw of events) {
            if (!raw.startsWith("data: ")) continue;
            const e = JSON.parse(raw.slice(6));
            if (e.type === "error") failed = e.message;
            else if (e.type === "compacted") compacted = true;
            else if (e.type !== "done") apply(e);
          }
        }
        if (failed) throw new Error(failed);
        setStatus("ready");
        setMessages((all) => all.map((m, i) => (i === all.length - 1 ? { ...m, endedAt: Date.now() } : m)));
        if (compacted) void loadHistory(); // show the summary divider in place of the older turns
      } catch (e) {
        if (ctrl.signal.aborted) return; // stop() or unmount handles the state
        setError((e as Error).message);
        setStatus("error");
      } finally {
        if (abort.current === ctrl) abort.current = null;
      }
    },
    [url, loadHistory],
  );

  // Stop the run on the server (closing the stream alone no longer stops it), then show where it ended.
  const stop = useCallback(async () => {
    abort.current?.abort();
    abort.current = null;
    clearTimeout(poll.current);
    if (!url) return;
    await fetch(`${url}/stop`, { method: "POST" }).catch(() => {});
    setStatus("ready");
    await loadHistory();
  }, [url, loadHistory]);
  const compact = useCallback(async () => {
    if (!url) return;
    setError(undefined);
    setStatus("submitted");
    const r = await fetch(`${url}/compact`, { method: "POST" }).catch(() => null);
    if (!r?.ok) setError(r ? (await r.json().catch(() => ({}))).error ?? `HTTP ${r.status}` : "Couldn't reach the server");
    setStatus("ready");
    await loadHistory();
  }, [url, loadHistory]);

  return { messages, status, error, historyReady, sendMessage, stop, compact };
}
