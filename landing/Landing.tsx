// The landing page: one Monday with OpenLeo, told in numbered scenes beside a sticky sidebar. Readers pick who
// they are (a salesperson, a tech lead…) and the story is theirs. Every picture is the app's own components
// (lists, cards, Leo's chat, an agent's steps, the Repeat row) drawing that story's data from ./demo.ts.
import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { buttonClass } from "../web/components/Button";
import { Icon, glyphs } from "../web/components/Icon";
import chatgptLogo from "../web/assets/chatgpt-logo-white.svg?url";
import { Logo } from "../web/components/Logo";
import { Select } from "../web/components/Select";
import { ThemeSwitch } from "../web/components/ThemeSwitch";
import { CardSchedule } from "../web/features/board/CardSchedule";
import { CardView } from "../web/features/board/CardView";
import { ListColumn } from "../web/features/board/ListColumn";
import { Row as GithubRow } from "../web/features/board/GithubList";
import { AgentIcon } from "../web/components/AgentIcon";
import { Dithering, GrainGradient, MeshGradient, Swirl, Warp } from "@paper-design/shaders-react";
import { useIsDark } from "../web/lib/theme";
import { AssistantMessage } from "../web/features/chat/messages/AssistantMessage";
import { UserBubble } from "../web/features/chat/messages/UserBubble";
import { seed, story, STORY_OPTIONS, type Story } from "./demo";
import intro from "./intro.mp4";
import introPoster from "./intro-poster.jpg?url";
import { detectDownload, GITHUB } from "./downloads";
import { DownloadButton, DownloadNote, GitHubButton, GitHubMark, Sidebar } from "./Sidebar";

export { detectDownload };

const LICENSE = <a href="https://www.gnu.org/licenses/agpl-3.0.html" className="hover:text-ink">AGPL-3.0</a>;
const all = () => true;

const still = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

// Shaders only on desktop; phones and tablets keep the plain backgrounds.
const wide = typeof matchMedia === "function" ? matchMedia("(min-width: 1024px)") : null;
const useDesktop = () => useSyncExternalStore(
  (on) => { wide?.addEventListener("change", on); return () => wide?.removeEventListener("change", on); },
  () => !!wide?.matches, () => false);

// Each section gets its own look, all in the same soft colours so the pictures stay readable.
const SOFT = {
  light: { back: "#f6f4ef", tints: ["#f4efe6", "#dce9e3", "#e7e2f1", "#f6e2d2"], dot: "#e2ddd2" },
  dark: { back: "#14171c", tints: ["#12161c", "#1b2a31", "#262333", "#1e2a25"], dot: "#232a31" },
};
type Look = (c: (typeof SOFT)["light"], speed: number) => ReactNode;
const fill = "absolute inset-0 -z-10";
const LOOKS: Look[] = [
  (c, speed) => <MeshGradient className={fill} colors={c.tints} distortion={0.9} swirl={0.35} grainOverlay={0.12} speed={speed} />,
  (c, speed) => <GrainGradient className={fill} colorBack={c.back} colors={c.tints} shape="corners" softness={0.8} intensity={0.3} noise={0.15} speed={speed} />,
  (c, speed) => <Swirl className={fill} colorBack={c.back} colors={c.tints} bandCount={3} twist={0.3} softness={1} noise={0.1} speed={speed} />,
  (c, speed) => <GrainGradient className={fill} colorBack={c.back} colors={c.tints} shape="wave" softness={0.8} intensity={0.3} noise={0.15} speed={speed} />,
  (c, speed) => <Dithering className={fill} colorBack={c.back} colorFront={c.dot} shape="warp" type="4x4" size={2} speed={speed} />,
  (c, speed) => <Warp className={fill} colors={c.tints} shape="checks" shapeScale={0.1} softness={1} distortion={0.3} swirl={0.6} speed={speed} />,
  (c, speed) => <GrainGradient className={fill} colorBack={c.back} colors={c.tints} shape="blob" softness={0.8} intensity={0.3} noise={0.15} speed={speed} />,
  (c, speed) => <Dithering className={fill} colorBack={c.back} colorFront={c.dot} shape="ripple" type="4x4" size={2} speed={speed} />,
];

/** A moving background behind its parent (which must be `relative isolate`), on desktop only. */
function Shade({ look }: { look: number }) {
  const dark = useIsDark();
  if (!useDesktop()) return null;
  return LOOKS[look % LOOKS.length]!(SOFT[dark ? "dark" : "light"], still ? 0 : 0.2);
}

/** A board's lists, on the scene's background (look, don't touch). */
function Stage({ board, lists }: { board: Story["board"]; lists: string[] }) {
  return (
    <div inert className="flex w-fit max-w-full items-start gap-3 overflow-hidden">
      {lists.map((id) => {
        const list = board.lists.find((l) => l.id === id)!;
        return <ListColumn key={id} list={list} cards={list.cards.map((c) => board.cards[c]!)} matches={all} onOpenTask={() => {}} />;
      })}
    </div>
  );
}

// The apps on a board's computer, drawn like their dock icons.
const appIcon = "size-10 drop-shadow-[0_2px_3px_rgb(0_0_0/0.3)]";
const CHROME_SECTOR = "M5.85 11.57A22 22 0 0 1 43.84 14.5H24a9.5 9.5 0 0 0-8.23 14.25z";
const APPS = [
  { name: "Files", icon: (
    <svg viewBox="0 0 48 48" className={appIcon}>
      <defs><linearGradient id="dock-folder" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#7cc8fb" /><stop offset="1" stopColor="#3f9ee8" /></linearGradient></defs>
      <path d="M4 12a3 3 0 0 1 3-3h11l4 4h19a3 3 0 0 1 3 3v22a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3z" fill="#3b8fd6" />
      <path d="M4 18a3 3 0 0 1 3-3h34a3 3 0 0 1 3 3v20a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3z" fill="url(#dock-folder)" />
      <path d="M7 15h34a3 3 0 0 1 3 3v1H4v-1a3 3 0 0 1 3-3z" fill="#fff" opacity="0.25" />
    </svg>) },
  { name: "Terminal", icon: (
    <svg viewBox="0 0 48 48" className={appIcon}>
      <defs><linearGradient id="dock-term" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#4a4a4f" /><stop offset="1" stopColor="#1c1c1f" /></linearGradient></defs>
      <rect x="3" y="3" width="42" height="42" rx="10" fill="#d9d9de" />
      <rect x="5" y="5" width="38" height="38" rx="8" fill="url(#dock-term)" />
      <path d="M11 15l6 4.5-6 4.5" fill="none" stroke="#f2f2f2" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M20 25h9" stroke="#f2f2f2" strokeWidth="2.2" strokeLinecap="round" />
    </svg>) },
  { name: "Chrome", icon: (
    <svg viewBox="0 0 48 48" className={appIcon}>
      <path d={CHROME_SECTOR} fill="#ea4335" />
      <path d={CHROME_SECTOR} fill="#fbbc04" transform="rotate(120 24 24)" />
      <path d={CHROME_SECTOR} fill="#34a853" transform="rotate(240 24 24)" />
      <circle cx="24" cy="24" r="9.5" fill="#fff" />
      <circle cx="24" cy="24" r="7.6" fill="#1a73e8" />
    </svg>) },
  { name: "VS Code", icon: (
    <svg viewBox="0 0 24 24" className={appIcon}>
      <defs><linearGradient id="dock-code" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#2bb0f6" /><stop offset="1" stopColor="#0065a9" /></linearGradient></defs>
      <path d="M23.15 2.587 18.21.21a1.494 1.494 0 0 0-1.705.29l-9.46 8.63-4.12-3.128a.999.999 0 0 0-1.276.057L.327 7.261A1 1 0 0 0 .326 8.74L3.899 12 .326 15.26a1 1 0 0 0 .001 1.479L1.65 17.94a.999.999 0 0 0 1.276.057l4.12-3.128 9.46 8.63a1.492 1.492 0 0 0 1.704.29l4.942-2.377A1.5 1.5 0 0 0 24 20.06V3.939a1.5 1.5 0 0 0-.85-1.352zm-5.146 14.861L10.826 12l7.178-5.448v10.896z" fill="url(#dock-code)" />
      <path d="M18.004 .5v23" stroke="#fff" strokeOpacity="0.15" />
    </svg>) },
];

// Photo by Martin Martz on Unsplash.
const WALLPAPER = "https://images.unsplash.com/photo-1687042277586-971369d3d241?w=1200&q=80&fm=jpg&fit=crop";

/** A board's computer at rest: the wallpaper, the logo, and a dock of apps. */
function Desktop() {
  return (
    <div className="relative flex aspect-[16/10] flex-col items-center justify-center overflow-hidden rounded-card bg-cover bg-center shadow-hairline" style={{ backgroundImage: `url("${WALLPAPER}")` }}>
      <Logo className="size-16 drop-shadow-lg" />
      <div className="absolute bottom-2.5 flex gap-2.5 rounded-[18px] border border-white/30 bg-white/25 px-2.5 py-1.5 shadow-[0_8px_24px_rgb(0_0_0/0.25)] backdrop-blur-xl">
        {APPS.map((a) => <span key={a.name} title={a.name} aria-label={a.name}>{a.icon}</span>)}
      </div>
    </div>
  );
}

/** A side panel like Leo's or a card's chat. */
function Panel({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <div inert className="flex w-full max-w-[440px] flex-col gap-4 rounded-[14px] bg-surface p-5 shadow-overlay">
      <div className="flex items-center gap-2">{icon}<h3 className="text-[15px] font-semibold text-ink">{title}</h3></div>
      {children}
    </div>
  );
}

const GITHUB_ROWS = [
  { key: "github:you/site#42", ref: "you/site#42", title: "Add dark mode to the settings page", url: "#", status: "open", by: "mai" },
  { key: "github:you/site#41", ref: "you/site#41", title: "Checkout fails when the cart is empty", url: "#", status: "open", by: "tom" },
  { key: "github:you/site#39", ref: "you/site#39", title: "Update the pricing table", url: "#", status: "draft", by: "lin" },
] as const;

/** A GitHub list as the app draws it: synced rows that become cards when dragged onto a list. */
function GithubDemo() {
  return (
    <div inert className="flex w-[272px] flex-col rounded-[14px] bg-surface/80 shadow-raised backdrop-blur-xl">
      <div className="flex h-11 items-center gap-2 px-3">
        <GitHubMark size={14} /><span className="flex-1 text-[14px] font-semibold text-ink">Pull requests</span><span className="text-[11.5px] text-ink-3">GitHub</span>
      </div>
      <div className="px-3 pb-1.5 text-[12px] text-ink-3">Synced just now</div>
      <div className="flex flex-col gap-2 px-2 pb-2">
        {GITHUB_ROWS.map((r, i) => <GithubRow key={r.key} row={{ ...r }} listId="github" added={i === 2} targets={[]} onAdd={() => {}} />)}
      </div>
    </div>
  );
}

/** Words to highlight in the story, in the app's accent tint. */
const Highlight = ({ children }: { children: ReactNode }) => <mark className="rounded-chip bg-accent-tint px-1.5 py-px font-medium text-accent-ink [box-decoration-break:clone]">{children}</mark>;




const KEY_FEATURES = [
  { icon: <span aria-hidden="true" className="size-[18px] bg-current [mask:var(--logo)_center/contain_no-repeat]" style={{ "--logo": `url("${chatgptLogo}")` } as React.CSSProperties} />, title: "Runs on your ChatGPT plan", text: "Sign in with ChatGPT and agents use the plan you already pay for. You don't need API keys, and there's no surprise bill." },
  { icon: <Logo className="size-5" />, title: "A real desktop for every board", text: "Agents browse, click and type on their own computer. Watch them work or take over any time." },
  { icon: <AgentIcon className="size-[18px]" />, title: "Make your own agents", text: "Give an agent a name and tell it in plain words what it does. Pick its model and how long it thinks before it acts." },
  { icon: <AgentIcon icon="book-open" className="size-[18px]" />, title: "Teach it skills", text: "Add a skill, like how you file receipts or your writing style, and the agent uses it whenever a task needs it." },
  { icon: <AgentIcon icon="wrench" className="size-[18px]" />, title: "Connect your apps", text: "Connect the apps you already use, and agents can read and act in them for you. You choose which agent gets which app." },
  { icon: <GitHubMark size={17} />, title: "Free and open source", text: "Download the Mac app or run it from source. The code is yours to read and change." },
];

const TITLES = [
  { id: "monday", title: "Twenty-three things. One of you." },
  { id: "tell-leo", title: "You tell Leo what the week is about." },
  { id: "board", title: "The list becomes a board." },
  { id: "github", title: "Pull work in from GitHub." },
  { id: "agents", title: "Agents pick up the cards." },
  { id: "watch", title: "Watch, or don't." },
  { id: "done", title: "By lunch, it's done." },
  { id: "again", title: "And tomorrow, it happens again." },
];

/** The story's scenes for one reader, titled from TITLES. Only the tech lead's story pulls work in from GitHub. */
function scenes(s: Story): { id: string; title: string; body: ReactNode; demo: ReactNode }[] {
  const desktop = <Icon size={16} className="text-ink-2">{glyphs.monitor}</Icon>;
  return ([
    { body: <>{s.copy.monday} <Highlight>clicking, reading and copying</Highlight>.</>, demo: <Stage board={s.board} lists={["today", "week", "later"]} /> },
    { body: <>Send <Highlight>one sentence</Highlight> to Leo, the assistant built into every board, and it sets the board up for you. You don't fill in setup screens or write code.</>,
      demo: <Panel title="Leo" icon={<Logo className="size-5" />}><UserBubble text={s.ask} /><AssistantMessage m={s.leoReply} streaming={false} agent="leo" model="openai/gpt-6-luna" /></Panel> },
    { body: <>Lists, the fields worth tracking, like <Highlight>{s.copy.board}</Highlight>, and a card for every task. New cards in {s.lists.work} go straight to the {s.agent}.</>,
      demo: <Stage board={s.board} lists={["first", "work"]} /> },
    { body: <>Point a list at GitHub and pick a repo: its pull requests or issues show up there. <Highlight>Drag one onto a list</Highlight> and that list's agent starts on it.</>,
      demo: <GithubDemo /> },
    { body: <>Each board has <Highlight>its own computer</Highlight>. {s.copy.agents}</>,
      demo: <Panel title={`#12 · ${s.agent}`} icon={desktop}><AssistantMessage m={s.workReply} streaming agent={s.agent} model="openai/gpt-6-sol" /></Panel> },
    { body: <>Peek in whenever you like. If something needs you, like a login, <Highlight>take over the desktop</Highlight>, do it, and hand it back. The rest of the time, get on with your day.</>,
      demo: <Panel title={`${s.agent}'s computer`} icon={desktop}>
        <Desktop />
        <p className="text-[13px] text-ink-2">Click to take over. It's your computer too.</p>
      </Panel> },
    { body: <>{s.copy.done} Not quite right? <Highlight>Reply on the card</Highlight> and the agent carries on in the same chat.</>, demo: <Stage board={s.board} lists={["done"]} /> },
    { body: <>Cards can repeat: every hour, every weekday, once a week. {s.copy.again} <Highlight>only bothers you</Highlight> when something needs you.</>,
      demo: <div inert className="flex w-full max-w-[440px] flex-col gap-2 rounded-[14px] bg-surface p-3 shadow-overlay">
        <CardView card={s.board.cards.c9!} listId="done" hidden={false} onOpenTask={() => {}} />
        <div className="px-2"><CardSchedule card={s.board.cards.c9!} agent={s.repeat.agent} /></div>
      </div> },
  ] as const).map((scene, i) => ({ ...TITLES[i]!, ...scene })).filter((scene) => scene.id !== "github" || s.id === "tech");
}

const section = "border-b border-dashed border-line px-6 py-14 sm:px-10";

// How OpenLeo compares with tools people use today (checked October 2026). true = yes, false = no, text = partly.
type Cell = boolean | string;
const ROWS = ["Picks up tasks from your list", "Works on its own computer", "Set up by asking in plain words", "Repeats work on a schedule", "All the work on one board", "Uses the ChatGPT plan you have", "Open source, data on your computer"];
const ONE = "One request at a time", TRIGGERS = "From triggers you set", FLOW = "You build each flow", BROWSER = "In a browser";
// One line per product, in the order of ROWS.
const PRODUCTS: { name: string; cells: Cell[] }[] = [
  { name: "OpenLeo", cells: [true, true, true, true, true, true, true] },
  { name: "ChatGPT agent", cells: [ONE, true, true, true, false, true, false] },
  { name: "Manus", cells: [ONE, true, true, true, false, false, false] },
  { name: "Microsoft 365 Copilot", cells: [ONE, true, true, true, false, false, false] },
  { name: "Grok Bot", cells: [TRIGGERS, true, true, true, false, false, false] },
  { name: "Meta Muse", cells: [ONE, BROWSER, true, "Keeps long tasks going", false, false, false] },
  { name: "Notion agents", cells: [TRIGGERS, false, true, true, true, false, false] },
  { name: "Lindy", cells: [TRIGGERS, true, true, true, false, false, false] },
  { name: "Twin", cells: [TRIGGERS, BROWSER, true, true, false, false, false] },
  { name: "Gumloop", cells: [TRIGGERS, BROWSER, true, true, false, false, false] },
  { name: "Zapier Agents", cells: [TRIGGERS, BROWSER, true, true, false, false, false] },
  { name: "Make", cells: [TRIGGERS, false, FLOW, true, false, false, false] },
  { name: "n8n", cells: [TRIGGERS, false, FLOW, true, false, "Needs API keys", "Source-available, self-host"] },
  { name: "Todoist", cells: ["Suggests next steps", false, "Turns speech into tasks", "Reminds you", true, false, false] },
];
const OTHERS = PRODUCTS.slice(1).map((p) => p.name);
const COMPARE = ROWS.map((row, i) => ({ row, cells: PRODUCTS.map((p) => p.cells[i]!) }));

const Mark = ({ v }: { v: boolean | string }) =>
  v === true ? <span className="inline-flex text-accent-ink" aria-label="Yes"><Icon size={16}>{glyphs.check}</Icon></span>
  : v === false ? <span className="inline-flex text-ink-3" aria-label="No"><Icon size={14}>{glyphs.close}</Icon></span>
  : <span className="text-[12.5px] text-ink-2">{v}</span>;

function Compare() {
  return (
    <section id="compare" className={`${section} flex flex-col gap-6`}>
      <div className="flex flex-col gap-2">
        <h2 className="text-[clamp(24px,2.6vw,32px)] leading-[1.15] font-semibold tracking-[-0.025em]">How it compares</h2>
        <p className="max-w-[600px] text-[15px] leading-relaxed text-ink-2">What you might use today for the same Monday, and where OpenLeo is different.</p>
      </div>
      <div className="overflow-x-auto rounded-card border border-line bg-surface">
        <table className="w-full min-w-[1600px] border-collapse text-left text-[13px]">
          <thead>
            <tr className="border-b border-line text-ink-2">
              <th className="sticky left-0 z-10 bg-surface px-4 py-3 font-medium" />
              <th className="bg-accent-tint px-4 py-3 font-semibold text-ink"><span className="flex items-center gap-2"><Logo className="size-5" />OpenLeo</span></th>
              {OTHERS.map((o) => <th key={o} className="px-4 py-3 font-medium">{o}</th>)}
            </tr>
          </thead>
          <tbody>
            {COMPARE.map((r) => (
              <tr key={r.row} className="border-b border-line last:border-b-0">
                <th scope="row" className="sticky left-0 z-10 w-52 bg-surface px-4 py-3 font-medium text-ink">{r.row}</th>
                {r.cells.map((v, i) => <td key={i} className={`px-4 py-3 ${i === 0 ? "bg-accent-tint" : ""}`}><Mark v={v} /></td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[12px] text-ink-3">Scroll sideways for more. Based on each product's public features in October 2026. Names belong to their owners.</p>
    </section>
  );
}
function DemoBox({ look, children }: { look: number; children: ReactNode }) {
  return (
    <div className="relative isolate flex min-h-72 items-center justify-center overflow-hidden rounded-card border border-line bg-canvas p-6 sm:p-8">
      <Shade look={look} />
      {children}
    </div>
  );
}

/** The scene in view: the sidebar highlights it. */
function useCurrentScene() {
  const [current, setCurrent] = useState<string>();
  useEffect(() => {
    const onScroll = () => {
      let at: string | undefined;
      for (const t of TITLES) if ((document.getElementById(t.id)?.getBoundingClientRect().top ?? Infinity) < innerHeight * 0.4) at = t.id;
      setCurrent(at);
    };
    addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => removeEventListener("scroll", onScroll);
  }, []);
  return current;
}

export function Landing({ initialStory = "sales" }: { initialStory?: string }) {
  const [storyId, setStoryId] = useState(() => { seed(story(initialStory)); return initialStory; });
  const s = useMemo(() => story(storyId), [storyId]);
  const chapters = useMemo(() => scenes(s), [s]);
  const current = useCurrentScene();
  // The app's components read the board from its store: load the reader's story there before showing it.
  const choose = (id: string) => { seed(story(id)); setStoryId(id); };
  const picker = (className: string) => <Select label="Who you are" value={storyId} onChange={choose} options={STORY_OPTIONS} className={className} />;

  return (
    <div className="frame min-h-screen text-ink">
      <div className="mx-auto flex max-w-[1180px] bg-page shadow-[0_0_0_1px_var(--line)] max-lg:flex-col">
        <Sidebar>
          <div className="flex flex-col gap-1.5 border-t border-dashed border-line pt-5 max-lg:hidden">
            <span className="text-[12px] text-ink-3">The story of a</span>
            {picker("w-full")}
          </div>
          <nav aria-label="The story" className="flex flex-col gap-0.5 max-lg:hidden">
            {chapters.map((t, i) => (
              <a key={t.id} href={`#${t.id}`} aria-current={current === t.id ? "true" : undefined}
                className={`flex h-8 items-center gap-2 rounded-control px-2 text-[13px] transition-colors duration-150 ${current === t.id ? "bg-hover-2 font-medium text-ink" : "text-ink-2 hover:bg-hover hover:text-ink"}`}>
                <span className="w-4 text-[11px] text-ink-3 tabular-nums">{String(i + 1).padStart(2, "0")}</span>
                <span className="truncate">{t.title}</span>
              </a>
            ))}
          </nav>
        </Sidebar>

        {/* The story */}
        <main className="min-w-0 flex-1">
          <section id="top" className={`${section} flex flex-col gap-8 pt-16`}>
            <div className="flex flex-col gap-5">
              <h1 className="max-w-[640px] text-[clamp(36px,4.4vw,54px)] leading-[1.04] font-semibold tracking-[-0.035em]">Your to-do list, done by agents.</h1>
              <p className="max-w-[600px] text-[17px] leading-relaxed text-ink-2">OpenLeo is a board where AI agents <Highlight>pick up your cards</Highlight>, work on <Highlight>their own computer</Highlight> and hand back the result. You sign in with ChatGPT, and you don't need API keys or code.</p>
              <div className="flex flex-wrap gap-2 lg:hidden"><DownloadButton big /><GitHubButton /></div>
            </div>
            <video src={intro} poster={introPoster} autoPlay muted loop playsInline controls preload="metadata" aria-label="OpenLeo in 30 seconds"
              className="aspect-video w-full rounded-card border border-line bg-[#141416]" />
            <div aria-label="Key features" className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
              {KEY_FEATURES.map((f) => (
                <div key={f.title} className="flex flex-col gap-2 rounded-card border border-line bg-surface p-4">
                  <span className="flex size-8 items-center justify-center rounded-control bg-hover-2 text-ink">{f.icon}</span>
                  <h3 className="mt-1 text-[14px] font-semibold text-ink">{f.title}</h3>
                  <p className="text-[13px] leading-relaxed text-ink-2">{f.text}</p>
                </div>
              ))}
            </div>
            <DemoBox look={0}><Stage board={s.board} lists={["first", "work", "done"]} /></DemoBox>
          </section>

          {/* Phones and tablets: the sidebar's story picker, which is hidden there. */}
          <div className={`${section} flex items-center gap-3 lg:hidden`}>
            <span className="text-[13px] text-ink-3">The story of a</span>
            {picker("w-44")}
          </div>

          {chapters.map((scene, i) => (
            <section key={scene.id} className={`chapter ${section} flex scroll-mt-4 flex-col gap-5`} id={scene.id}>
              <div className="flex flex-col gap-1.5">
                <span className="text-[13px] text-ink-3 tabular-nums">{String(i + 1).padStart(2, "0")}</span>
                <h2 className="text-[clamp(24px,2.6vw,32px)] leading-[1.15] font-semibold tracking-[-0.025em]">{scene.title}</h2>
                <p className="max-w-[600px] text-[15px] leading-relaxed text-ink-2">{scene.body}</p>
              </div>
              <DemoBox look={i + 1}>{scene.demo}</DemoBox>
            </section>
          ))}

          <Compare />

          <section className={`${section} flex flex-col items-center gap-5 border-b-0 py-20 text-center`}>
            <Logo className="size-12" follow />
            <h2 className="text-[clamp(26px,3vw,36px)] font-semibold tracking-[-0.03em]">Your Monday could start like this.</h2>
            <DownloadButton big />
            <DownloadNote className="text-[13px]" />
          </section>
          <footer className="flex flex-wrap justify-between gap-3 border-t border-line px-6 py-5 text-[12.5px] text-ink-2 sm:px-10">
            <span>OpenLeo, open source under {LICENSE}</span>
            <span className="flex gap-4">
              <a href="./download" className="hover:text-ink">Download</a>
              <a href="./blog" className="hover:text-ink">Blog</a>
              <a href="./changelog" className="hover:text-ink">Changelog</a>
              <a href="./privacy" className="hover:text-ink">Privacy</a>
              <a href="./terms" className="hover:text-ink">Terms</a>
              <a href={GITHUB} className="hover:text-ink">GitHub</a>
            </span>
          </footer>
        </main>
      </div>
    </div>
  );
}
