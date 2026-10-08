// The story's data, one version per kind of reader (a salesperson, a tech lead…): a board, its agents and a
// few chats, shown by the app's real components (no server). `seed` loads a story into the app's stores.
import type { Field } from "../shared/fields";
import type { AgentDef, Board, TaskCard } from "../shared/types";
import type { Message, ToolPart } from "../web/features/chat/useAgent";
import { useBoard } from "../web/features/board/store";
import { useApp } from "../web/stores/app-store";

const HOUR = 3_600_000;
const monday = new Date(2026, 9, 5, 8, 12).getTime();

const agent = (name: string, description: string, icon: string): AgentDef =>
  ({ name, description, icon, model: "openai/gpt-6-sol", instructions: "", subagents: [], mcp: [] });
const AGENTS = [
  agent("researcher", "Finds and compares things on the web", "magnifying-glass"),
  agent("monitor", "Checks that things keep working", "eye"),
  agent("reviewer", "Reviews code changes", "code"),
  agent("bookkeeper", "Matches receipts and payments", "receipt"),
  agent("writer", "Drafts emails and posts", "pencil-simple"),
];

/** What changes from one reader's story to another's. */
type Spec = {
  id: string; label: string;
  /** this week's to-dos, the first two go to the board's first list */
  todo: string[];
  lists: { first: string; work: string; firstIcon: string; workIcon: string };
  agent: string;
  fields: Field[];
  working: { title: string; values: Record<string, string>; search: string; typed: string; url: string; filled: Record<string, string> };
  /** more cards the agent is working on at the same time */
  alsoWorking: { title: string; values: Record<string, string> }[];
  done: { title: string; values: Record<string, string> }[];
  repeat: { title: string; agent: string; at: string; days: number[]; result: string };
  ask: string; reply: string;
  copy: { monday: string; board: string; agents: string; done: string; again: string };
};

const SPECS: Spec[] = [
  {
    id: "sales", label: "Salesperson",
    todo: ["Find 10 cafés in Da Nang that sell online", "Compare 3 coffee suppliers", "Draft a follow-up for the Hue lead", "Answer last week's emails", "Update the pipeline sheet"],
    lists: { first: "Leads", work: "Research", firstIcon: "users", workIcon: "magnifying-glass" }, agent: "researcher",
    fields: [{ id: "deal", name: "Deal value", type: "number" }, { id: "next", name: "Next follow-up", type: "date" }],
    working: { title: "Summarise replies from leads", values: { deal: "4800" }, search: "cafés in Da Nang that sell coffee online", typed: "Hạt Café Da Nang", url: "https://hatcafe.vn/shop", filled: { "Deal value": "4800" } },
    alsoWorking: [{ title: "Find the owner's email for Hạt Café", values: { deal: "2500" } }, { title: "Check prices on 3 supplier sites", values: {} }],
    done: [{ title: "10 cafés found, with contacts", values: { deal: "12000", next: "2026-10-09" } }, { title: "Suppliers compared", values: { deal: "3200" } }],
    repeat: { title: "Check for new replies from leads", agent: "researcher", at: "09:00", days: [1, 2, 3, 4, 5], result: "2 new replies, both added to their cards." },
    ask: "This week: grow my café leads and keep the follow-ups going. Set it up and get started.",
    reply: "Your sales board is ready: **Leads**, **Research** and **Done**, with fields for deal value and the next follow-up. The researcher is already on #12.",
    copy: {
      monday: "Find new leads. Compare suppliers. Answer last week's emails. The list is longer than the day, and most of it is",
      board: "deal value and next follow-up",
      agents: "Agents search and click through sites the way a careful assistant would, then write what they find on the card.",
      done: "Ten cafés found with their contacts, and the suppliers compared side by side.",
      again: "Every weekday at 9, the researcher checks for new replies and",
    },
  },
  {
    id: "tech", label: "Tech lead",
    todo: ["Review the open pull requests", "Find why the nightly build is slow", "Check the staging site after deploy", "Write release notes for 2.4", "Answer the team's questions"],
    lists: { first: "Backlog", work: "In review", firstIcon: "code", workIcon: "magnifying-glass" }, agent: "reviewer",
    fields: [{ id: "pr", name: "Pull request", type: "link" }, { id: "risk", name: "Risk", type: "select", options: ["Low", "Medium", "High"] }],
    working: { title: "Review the payments pull request", values: { pr: "https://github.com/acme/shop/pull/482", risk: "Medium" }, search: "acme shop pull request 482 payments", typed: "npm test -- payments", url: "https://github.com/acme/shop/pull/482", filled: { Risk: "Medium" } },
    alsoWorking: [{ title: "Read last night's error logs", values: { risk: "Low" } }, { title: "Review the login page pull request", values: { pr: "https://github.com/acme/shop/pull/479", risk: "Low" } }],
    done: [{ title: "Nightly build: cache was off, fixed", values: { risk: "Low" } }, { title: "Release notes for 2.4 drafted", values: { pr: "https://github.com/acme/shop/pull/479" } }],
    repeat: { title: "Check staging after each night's deploy", agent: "monitor", at: "07:00", days: [1, 2, 3, 4, 5], result: "Staging is up; all 42 checks passed." },
    ask: "This week: ship 2.4. Review what's open, chase the slow build and keep an eye on staging.",
    reply: "Your release board is ready: **Backlog**, **In review** and **Done**, with fields for the pull request and its risk. The reviewer is already on #12.",
    copy: {
      monday: "Review pull requests. Chase a slow build. Check staging. Write the release notes. Most of it is",
      board: "pull request and risk",
      agents: "Agents open the pull request, run the tests, read the logs and leave notes on the card.",
      done: "Each pull request has a risk rating, and the slow build turned out to be a cache someone switched off.",
      again: "Every weekday at 7, the monitor checks staging after the night's deploy and",
    },
  },
  {
    id: "accounting", label: "Accountant",
    todo: ["Match September receipts to payments", "Chase 4 unpaid invoices", "Check this month's VAT figures", "File the expense reports", "Answer the auditor's email"],
    lists: { first: "To match", work: "Checking", firstIcon: "receipt", workIcon: "scales" }, agent: "bookkeeper",
    fields: [{ id: "amount", name: "Amount", type: "number" }, { id: "due", name: "Due", type: "date" }],
    working: { title: "Match September receipts", values: { amount: "18450000" }, search: "September card statement receipts", typed: "Receipt 2026-09-14", url: "https://bank.example/statements/2026-09", filled: { Amount: "18450000" } },
    alsoWorking: [{ title: "Chase the invoice from Minh Phat", values: { amount: "6200000", due: "2026-10-10" } }, { title: "Sort receipts by category", values: {} }],
    done: [{ title: "37 of 38 receipts matched", values: { amount: "18450000" } }, { title: "4 reminder emails drafted", values: { due: "2026-10-12" } }],
    repeat: { title: "Check for new unpaid invoices", agent: "bookkeeper", at: "08:30", days: [1, 3, 5], result: "No new unpaid invoices." },
    ask: "This week: close September. Match receipts, chase unpaid invoices and check the VAT figures.",
    reply: "Your month-end board is ready: **To match**, **Checking** and **Done**, with fields for amount and due date. The bookkeeper is already on #12.",
    copy: {
      monday: "Match receipts. Chase invoices. Check the VAT figures. File expenses. Most of it is",
      board: "amount and due date",
      agents: "Agents open the statements, compare line by line and note anything that doesn't match on the card.",
      done: "37 of 38 receipts matched. The odd one is flagged for you, and the reminders are drafted.",
      again: "Every Monday, Wednesday and Friday, the bookkeeper checks for unpaid invoices and",
    },
  },
  {
    id: "marketing", label: "Marketer",
    todo: ["Plan this week's posts", "Research 5 competitor launches", "Draft the newsletter", "Check last week's post results", "Find 3 partners to work with"],
    lists: { first: "Ideas", work: "Drafting", firstIcon: "lightbulb", workIcon: "pencil-simple" }, agent: "writer",
    fields: [{ id: "channel", name: "Channel", type: "select", options: ["Newsletter", "Instagram", "Blog"] }, { id: "publish", name: "Publish on", type: "date" }],
    working: { title: "Draft the newsletter", values: { channel: "Newsletter", publish: "2026-10-08" }, search: "competitor product launches this week", typed: "Subject: What's new this autumn", url: "https://blog.example.com/autumn-launch", filled: { "Publish on": "2026-10-08" } },
    alsoWorking: [{ title: "Write 3 Instagram captions", values: { channel: "Instagram", publish: "2026-10-09" } }, { title: "Resize images for the blog post", values: {} }],
    done: [{ title: "5 competitor launches summarised", values: { channel: "Blog" } }, { title: "This week's 4 posts drafted", values: { channel: "Instagram", publish: "2026-10-06" } }],
    repeat: { title: "Collect last week's post results", agent: "researcher", at: "09:00", days: [1], result: "Reach up 18%; the Tuesday post did best." },
    ask: "This week: plan the posts, draft the newsletter and see what competitors launched.",
    reply: "Your content board is ready: **Ideas**, **Drafting** and **Done**, with fields for channel and publish date. The writer is already on #12.",
    copy: {
      monday: "Plan posts. Draft the newsletter. Read what competitors did. Check last week's numbers. Most of it is",
      board: "channel and publish date",
      agents: "Agents look things up and write drafts in your voice, then put them on the card.",
      done: "This week's posts are drafted and scheduled, with a summary of what competitors launched.",
      again: "Every Monday, an agent collects last week's results and",
    },
  },
];

export type Story = Spec & { board: Board; leoReply: Message; workReply: Message };
export const STORY_OPTIONS = SPECS.map((s) => ({ value: s.id, label: s.label }));

const card = (num: number, title: string, rest: Partial<TaskCard> = {}): TaskCard =>
  ({ id: `c${num}`, num, kind: "task", title, notes: "", status: "todo", ...rest });

const tool = (toolName: string, input: unknown, output = ""): ToolPart =>
  ({ type: "dynamic-tool", toolCallId: `${toolName}-${JSON.stringify(input).length}`, toolName, input, state: "output-available", output });

/** A reader's story, built from their spec. */
export function story(id: string): Story {
  const s = SPECS.find((x) => x.id === id) ?? SPECS[0]!;
  const todo = s.todo.map((t, i) => card(14 + i, t));
  const cards = [
    ...todo,
    card(12, s.working.title, { status: "running", agent: s.agent, agents: [s.agent], values: s.working.values }),
    ...s.alsoWorking.map((w, i) => card(10 + i, w.title, { status: "running", agent: s.agent, agents: [s.agent], values: w.values })),
    card(7, s.done[0]!.title, { status: "done", agent: s.agent, agents: [s.agent], values: s.done[0]!.values }),
    card(8, s.done[1]!.title, { status: "done", agent: s.agent, agents: [s.agent], values: s.done[1]!.values }),
    card(9, s.repeat.title, {
      status: "done", agent: s.repeat.agent, agents: [s.repeat.agent], result: s.repeat.result, ranAt: monday,
      schedule: { agent: s.repeat.agent, zone: "Asia/Ho_Chi_Minh", at: s.repeat.at, days: s.repeat.days }, nextRunAt: monday + 24 * HOUR,
      runs: [1, 2, 3, 4, 5].map((d) => ({ at: monday - d * 24 * HOUR, agent: s.repeat.agent, how: "schedule" as const, status: "done" as const })),
    }),
  ];
  const board: Board = {
    title: s.label, nextNum: 19, rev: 1, fields: s.fields,
    lists: [
      // Monday morning, before Leo: the to-dos spread over a plain board.
      { id: "today", title: "Today", icon: "flag", cards: todo.slice(0, 2).map((c) => c.id) },
      { id: "week", title: "This week", icon: "list-checks", cards: todo.slice(2, 4).map((c) => c.id) },
      { id: "later", title: "Later", icon: "hourglass", cards: todo.slice(4).map((c) => c.id) },
      { id: "first", title: s.lists.first, icon: s.lists.firstIcon, cards: todo.slice(0, 2).map((c) => c.id) },
      { id: "work", title: s.lists.work, icon: s.lists.workIcon, agent: s.agent, cards: ["c12", ...s.alsoWorking.map((_, i) => `c${10 + i}`)] },
      { id: "done", title: "Done", icon: "check-circle", cards: ["c7", "c8", "c9"] },
    ],
    cards: Object.fromEntries(cards.map((c) => [c.id, c])),
  };
  const leoReply: Message = {
    id: `leo-${s.id}`, role: "assistant", startedAt: monday, endedAt: monday + 14_000,
    parts: [
      tool("set_list", { list: s.lists.first }),
      tool("set_list", { list: s.lists.work, agent: s.agent }),
      tool("add_fields", { fields: s.fields }),
      tool("add_cards", { list: s.lists.first, cards: todo.slice(0, 2) }),
      tool("start_agent", { card: 12, agent: s.agent }),
      { type: "text", text: s.reply },
    ],
  };
  const workReply: Message = {
    id: `work-${s.id}`, role: "assistant", startedAt: Date.now() - 41_000,
    parts: [
      tool("web_search", { type: "search", query: s.working.search }),
      tool("computer", { action: "left_click", x: 412, y: 286 }),
      tool("computer", { action: "type", text: s.working.typed }),
      tool("fetch_url", { url: s.working.url }),
      tool("set_card_fields", { values: s.working.filled }),
      { type: "dynamic-tool", toolCallId: "reading", toolName: "computer", input: { action: "scroll", dy: 600 }, state: "input-available" },
    ],
  };
  return { ...s, board, leoReply, workReply };
}

/** Fill the app's stores so its components draw this story's board and agents. */
export function seed(s: Story) {
  useApp.setState({ agents: AGENTS, agentsLoaded: true });
  useBoard.setState({ boardId: "demo", board: s.board });
}
