// The OpenLeo desktop app: runs the bundled server with its data in the app's data folder, shows it in a window,
// and stays in the menu bar (tray on Windows and Linux) after the window closes so schedules keep running.
import { ApplicationMenu, BrowserWindow, PATHS, Tray, Updater, Utils } from "electrobun/main";
import { delimiter, join } from "node:path";

// Must stay 3000: Sign in with ChatGPT returns to http://127.0.0.1:3000/auth/callback.
const PORT = 3000;
const APP_URL = `http://127.0.0.1:${PORT}`;
const SERVER_DIR = join(PATHS.RESOURCES_FOLDER, "app", "openleo");
const MAC = process.platform === "darwin";
const GOOGLE_SIGN_IN = "https://accounts.google.com/o/oauth2/";

const isUp = () => fetch(`${APP_URL}/api/auth/config`).then((r) => r.ok, () => false);

// If an OpenLeo server is already running (e.g. `bun run dev`), the app shows that one instead of a second.
let server: ReturnType<typeof Bun.spawn> | undefined;
if (!(await isUp())) {
  server = Bun.spawn([join(SERVER_DIR, process.platform === "win32" ? "openleo-server.exe" : "openleo-server")], {
    cwd: SERVER_DIR, // the native cua library is found in node_modules next to the server
    // Apps opened from Finder get a bare PATH: add where `container` and `docker` are installed.
    env: {
      ...process.env,
      ...(MAC ? { PATH: [process.env.PATH ?? "/usr/bin:/bin:/usr/sbin:/sbin", "/usr/local/bin", "/opt/homebrew/bin"].join(delimiter) } : {}),
      OPENLEO_HOME: Utils.paths.userData, PORT: String(PORT),
    },
    stdout: "inherit",
    stderr: "inherit",
  });
  for (let i = 0; i < 150 && !(await isUp()); i++) await Bun.sleep(100);
}

let win: BrowserWindow | null = null;
function openWindow() {
  if (win) {
    if (win.isMinimized()) win.unminimize();
    win.show();
    win.focus();
    return;
  }
  win = new BrowserWindow({
    title: "OpenLeo", url: APP_URL, frame: { width: 1320, height: 860, x: 120, y: 80 },
  });
  (win.webview.on as (name: string, handler: (e: unknown) => void) => void)("new-window-open", (e: any) => {
    const detail = e?.data?.detail;
    const url = typeof detail === "string" ? detail : detail?.url;
    if (typeof url === "string" && /^https?:\/\//.test(url)) Utils.openExternal(url);
  });
  // Signing in with Google: OpenAI doesn't ask Google to show its account picker, so Google silently picks the
  // account this window is signed in to. Such a request is held back and sent again with the picker asked for.
  win.webview.setNavigationRules([`^${GOOGLE_SIGN_IN}*`, `${GOOGLE_SIGN_IN}*prompt=*`]);
  (win.webview.on as (name: string, handler: (e: unknown) => void) => void)("will-navigate", (e: any) => {
    // { url, allowed }, as an object or JSON text
    let detail = e?.data?.detail;
    if (typeof detail === "string") try { detail = JSON.parse(detail); } catch { return; }
    const url = detail?.url;
    // Only a request the rules held back: if it went through anyway, sending it again would load it twice.
    if (detail?.allowed !== false || typeof url !== "string" || !url.startsWith(GOOGLE_SIGN_IN) || !URL.canParse(url)) return;
    const pick = new URL(url);
    pick.searchParams.set("prompt", "select_account");
    win?.webview.loadURL(pick.toString());
  });
  win.on("close", () => { win = null; });
}

function quit() {
  server?.kill();
  Utils.quit();
}

// Standard menus so ⌘C / ⌘V / ⌘Q work (Windows and Linux webviews have them built in).
if (MAC) ApplicationMenu.setApplicationMenu([
  { submenu: [{ role: "about" }, { label: "Check for Updates…", action: "check-update" }, { type: "divider" }, { role: "hide" }, { role: "hideOthers" }, { role: "showAll" }, { type: "divider" }, { label: "Quit OpenLeo", action: "quit", accelerator: "q" }] },
  { label: "Edit", submenu: [{ role: "undo" }, { role: "redo" }, { type: "divider" }, { role: "cut" }, { role: "copy" }, { role: "paste" }, { role: "selectAll" }] },
  { label: "Window", submenu: [{ role: "minimize" }, { role: "zoom" }, { role: "close" }, { type: "divider" }, { role: "bringAllToFront" }] },
]);
ApplicationMenu.on("application-menu-clicked", (e: any) => {
  if (e.data?.action === "quit") quit();
  else if (e.data?.action === "check-update") void checkForUpdate(true);
});

// On a Mac the icon is a template image that macOS colours for a light or dark menu bar.
const tray = new Tray({ image: join(PATHS.RESOURCES_FOLDER, "app", MAC ? "tray.png" : "tray-color.png"), template: MAC, width: 16, height: 16 });
let readyVersion: string | undefined;
function setTrayMenu() {
  tray.setMenu([
    { type: "normal", label: "Open OpenLeo", action: "open" },
    { type: "normal", label: "Open in Browser", action: "browser" },
    { type: "divider" },
    readyVersion
      ? { type: "normal", label: `Restart to Update (${readyVersion})`, action: "update" }
      : { type: "normal", label: "Check for Updates…", action: "check-update" },
    { type: "divider" },
    { type: "normal", label: "Quit OpenLeo", action: "quit" },
  ]);
}
setTrayMenu();
tray.on("tray-clicked", (e: any) => {
  const action = e.data?.action;
  if (action === "browser") Utils.openExternal(APP_URL);
  else if (action === "quit") quit();
  else if (action === "update") void Updater.applyUpdate();
  else if (action === "check-update") void checkForUpdate(true);
  else openWindow();
});

// Runs at start and every 6 hours; `asked` (from the menu) also reports the result and offers a restart.
async function checkForUpdate(asked = false) {
  const problem = readyVersion ? undefined : await prepareUpdate();
  if (!asked) return;
  if (problem) return void Utils.showMessageBox({ title: "OpenLeo", message: problem });
  const { response } = await Utils.showMessageBox({
    title: "OpenLeo", message: `OpenLeo ${readyVersion} is ready. Restart now to update?`,
    buttons: ["Restart Now", "Later"], defaultId: 0, cancelId: 1,
  });
  if (response === 0) void Updater.applyUpdate();
}

/** Download a newer release, ready to install on restart. Returns why not, when it can't. */
async function prepareUpdate(): Promise<string | undefined> {
  const found = await Updater.checkForUpdate().catch(() => undefined);
  if (!found || found.error) return "Couldn't check for updates. Check your internet connection and try again later.";
  if (!found.updateAvailable) return "OpenLeo is up to date.";
  await Updater.downloadUpdate().catch(() => {});
  if (!Updater.updateInfo().updateReady) return "Couldn't download the update. Try again later.";
  readyVersion = found.version;
  setTrayMenu();
}
void checkForUpdate();
setInterval(() => void checkForUpdate(), 6 * 60 * 60 * 1000);

process.on("exit", () => server?.kill());
openWindow();
