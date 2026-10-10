// Card runs: an agent works on a task card in the card's board (its agents, chats and computer). A card runs
// by hand, on its schedule, or when it lands in a list with an agent; each run is noted on the card.
import { MEMORY_KEEPER, taskAgents, type TaskCard, type TaskRun } from "../../shared/types";
import { nextRun, parseSchedule } from "../../shared/schedule";
import type { Field } from "../../shared/fields";
import { saveConversation } from "../infra/conversations";
import { checkRuns, checkStorage } from "../infra/limits";
import { lastText } from "../infra/runtime";
import { inBoard } from "../infra/sandbox";
import { inTenant, listTenants } from "../infra/tenant";
import { loadDef } from "./agents";
import { addCard, boardOfCard, getBoard, listBoards, updateTask } from "./boards";
import { compactIfLong, compacting, getSession, runningCount, skey, taskStops } from "./live-agents";
import { TIDY_NOTES, TIDY_TITLE } from "./notes";

const RUNS_KEPT = 20;
const FAILS_TO_PAUSE = 3; // a schedule that keeps failing stops itself rather than spend usage on nothing

/**
 * Note a finished (or skipped) run on its card. A scheduled run that failed adds to the card's failure count;
 * after FAILS_TO_PAUSE in a row its schedule pauses. A good scheduled run clears the count.
 */
function recordRun(bid: string, cid: string, run: TaskRun) {
  const card = getBoard(bid).cards[cid];
  if (!card) return;
  const patch: Partial<TaskCard> = { runs: [...(card.runs ?? []), run].slice(-RUNS_KEPT) };
  if (run.how === "schedule" && run.status !== "skipped") {
    const failStreak = run.status === "error" ? (card.failStreak ?? 0) + 1 : 0;
    patch.failStreak = failStreak;
    if (failStreak >= FAILS_TO_PAUSE && card.schedule) Object.assign(patch, { schedule: { ...card.schedule, paused: true }, nextRunAt: undefined });
  }
  updateTask(bid, cid, patch);
}

/** The fields set on the card, with their values (empty ones are left out). */
function fieldsNote(board: { fields?: Field[] }, card: TaskCard) {
  const set = (board.fields ?? []).filter((f) => card.values?.[f.id]);
  if (!set.length) return "";
  const rows = set.map((f) => `- ${f.name} (${f.type}${f.options?.length ? `: ${f.options.join(" / ")}` : ""}): ${card.values![f.id]}`);
  return `Card fields (change them with set_card_fields):\n${rows.join("\n")}`;
}

/** Run a card's agent on it, inside the card's board. `how` says what started it (for the card's run history). */
export function runTask(bid: string, cid: string, agentName: string, how: TaskRun["how"] = "manual") {
  return inBoard(bid, () => runTaskHere(bid, cid, agentName, how));
}

function runTaskHere(bid: string, cid: string, agentName: string, how: TaskRun["how"]) {
  const card = getBoard(bid).cards[cid];
  if (card?.kind !== "task") throw new Error("no such task");
  if (card.status === "running") throw new Error("task is already running");
  loadDef(agentName);
  checkRuns(runningCount());
  checkStorage();
  // The task's one conversation with this agent: each run (by hand, on schedule) continues it, like a follow-up.
  const conversation = `task-${cid}`, key = skey(agentName, conversation);
  const agent = getSession(agentName, conversation);
  if (agent.state.isStreaming || compacting.has(key)) throw new Error(`${agentName} is still working on this task`);
  const agents = [...new Set([...taskAgents(card), agentName])];
  updateTask(bid, cid, { status: "running", agent: agentName, agents, result: undefined, ranAt: Date.now() });
  const prompt = [card.title, card.notes.trim(), fieldsNote(getBoard(bid), card)].filter(Boolean).join("\n\n");
  const started = Date.now();
  let finished = false;
  const finish = (status: "done" | "error", result: string) => {
    if (finished) return;
    finished = true;
    taskStops.delete(key);
    updateTask(bid, cid, { status, result });
    recordRun(bid, cid, { at: started, agent: agentName, how, status, ...(status === "error" ? { note: result.slice(0, 300) } : {}) });
    void saveConversation(agentName, conversation, agent.state.messages);
  };
  // Stop ends the run at once, even when a tool call is stuck and the agent never settles.
  taskStops.set(key, () => finish("error", "Stopped."));
  const go = async () => {
    await compactIfLong(agentName, key, agent); // a task that repeats grows its chat on every run
    await inBoard(bid, () => agent.prompt(prompt));
  };
  go().then(
    () => (agent.state.errorMessage ? finish("error", agent.state.errorMessage) : finish("done", lastText(agent).slice(0, 20_000))),
    (e) => finish("error", (e as Error).message),
  );
}

/**
 * A message in a task's chat ("task-<card id>") is a run too: the card shows it working, then its result.
 * Returns how to note the end (nothing to do when the chat isn't a task's).
 */
export function chatRun(conversation: string, agentName: string) {
  const cid = conversation.startsWith("task-") ? conversation.slice(5) : "";
  const bid = cid ? boardOfCard(cid) : undefined;
  if (!bid || getBoard(bid).cards[cid]?.kind !== "task") return () => {};
  const started = Date.now();
  updateTask(bid, cid, { status: "running", agent: agentName, result: undefined, ranAt: started });
  return (error: string | undefined, text: string) => {
    if (!getBoard(bid).cards[cid]) return;
    updateTask(bid, cid, error ? { status: "error", result: error } : { status: "done", result: text.slice(0, 20_000) });
    recordRun(bid, cid, { at: started, agent: agentName, how: "manual", status: error ? "error" : "done", ...(error ? { note: error.slice(0, 300) } : {}) });
  };
}

/** Start a run that nobody is waiting on (a schedule, a new card): if it can't start, the card's history says why. */
export function startOrNote(bid: string, cid: string, agentName: string, how: TaskRun["how"]) {
  try { runTask(bid, cid, agentName, how); }
  catch (e) { recordRun(bid, cid, { at: Date.now(), agent: agentName, how, status: "error", note: (e as Error).message }); }
}

/**
 * Run the cards whose schedule is due, for every account. The next run is booked before this one starts,
 * so a failure waits for its next turn instead of retrying every tick; a card still working skips its turn.
 * A run missed while the computer slept comes once on wake, never as a backlog.
 */
export function runDueSchedules() {
  const now = Date.now();
  for (const tenant of listTenants()) inTenant(tenant, () => {
    for (const { id: bid } of listBoards()) for (const card of Object.values(getBoard(bid).cards)) {
      const s = card.schedule;
      if (!s || s.paused || !card.nextRunAt || card.nextRunAt > now) continue;
      updateTask(bid, card.id, { nextRunAt: nextRun(s, now, "minutes" in s ? card.nextRunAt : undefined) });
      if (card.status === "running") { recordRun(bid, card.id, { at: now, agent: s.agent, how: "schedule", status: "skipped", note: "Still working on the last run." }); continue; }
      startOrNote(bid, card.id, s.agent, "schedule");
    }
  });
}

/** Cards that arrived in a list with an agent: that agent works on each (a failure to start is noted on the card). */
export function runAddedCards(bid: string, before: Set<string>) {
  for (const list of getBoard(bid).lists) {
    if (!list.agent) continue;
    for (const cid of list.cards) if (!before.has(cid)) startOrNote(bid, cid, list.agent, "added");
  }
}

/** The nightly memory tidy: a repeating card on the board, run by the built-in memory keeper. Off pauses it. */
export function setTidy(bid: string, on: boolean, zone: unknown) {
  const board = getBoard(bid);
  const card = Object.values(board.cards).find((c) => c.kind === "task" && c.schedule?.agent === MEMORY_KEEPER) as TaskCard | undefined;
  if (!on) {
    if (card?.schedule) updateTask(bid, card.id, { schedule: { ...card.schedule, paused: true } });
    return;
  }
  const schedule = parseSchedule({ agent: MEMORY_KEEPER, zone, at: "03:00", days: [0, 1, 2, 3, 4, 5, 6] });
  if (!schedule) throw new Error("unknown time zone");
  const list = board.lists[0];
  if (!card && !list) throw new Error("add a list to this board first");
  const target = card ?? addCard(bid, list!.id, TIDY_TITLE, TIDY_NOTES);
  updateTask(bid, target.id, { schedule, nextRunAt: nextRun(schedule, Date.now()), agents: [...new Set([...taskAgents(target), MEMORY_KEEPER])] });
}
