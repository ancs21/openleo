// The OpenLeo desktop app (macOS, Windows, Linux): runs the OpenLeo server (compiled into the app, see scripts/build-server.ts) with its data
// in the app's data folder, shows it in a window, and keeps it running from the menu bar when the window closes,
// so schedules and agents keep working in the background. On Windows and Linux the tray icon does the same.
import { ApplicationMenu, BrowserWindow, PATHS, Tray, Updater, Utils } from "electrobun/main";
import { delimiter, join } from "node:path";

// Must stay 3000: Sign in with ChatGPT returns to http://127.0.0.1:3000/auth/callback.
const PORT = 3000;
const APP_URL = `http://127.0.0.1:${PORT}`;
const SERVER_DIR = join(PATHS.RESOURCES_FOLDER, "app", "openleo");
const MAC = process.platform === "darwin";

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
  // Links that open a new window (target=_blank) go to the default browser.
  (win.webview.on as (name: string, handler: (e: unknown) => void) => void)("new-window-open", (e: any) => {
    const detail = e?.data?.detail;
    const url = typeof detail === "string" ? detail : detail?.url;
    if (typeof url === "string" && /^https?:\/\//.test(url)) Utils.openExternal(url);
  });
  win.on("close", () => { win = null; });
}

function quit() {
  server?.kill();
  Utils.quit();
}

// Standard menus, so ⌘C / ⌘V / ⌘Q and window shortcuts work inside the app (Windows and Linux webviews have them built in).
if (MAC) ApplicationMenu.setApplicationMenu([
  { submenu: [{ role: "about" }, { label: "Check for Updates…", action: "check-update" }, { type: "divider" }, { role: "hide" }, { role: "hideOthers" }, { role: "showAll" }, { type: "divider" }, { label: "Quit OpenLeo", action: "quit", accelerator: "q" }] },
  { label: "Edit", submenu: [{ role: "undo" }, { role: "redo" }, { type: "divider" }, { role: "cut" }, { role: "copy" }, { role: "paste" }, { role: "selectAll" }] },
  { label: "Window", submenu: [{ role: "minimize" }, { role: "zoom" }, { role: "close" }, { type: "divider" }, { role: "bringAllToFront" }] },
]);
ApplicationMenu.on("application-menu-clicked", (e: any) => {
  if (e.data?.action === "quit") quit();
  else if (e.data?.action === "check-update") void checkForUpdate(true);
});

// Menu bar (tray on Windows and Linux): reopen the window, open in a browser, or quit (closing the window keeps
// OpenLeo running). On a Mac the icon is a template image that macOS colours for a light or dark menu bar.
const tray = new Tray({ image: join(PATHS.RESOURCES_FOLDER, "app", MAC ? "tray.png" : "tray-color.png"), template: MAC, width: 16, height: 16 });
let readyVersion: string | undefined; // a downloaded update, waiting for a restart
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
  else if (action === "update") void Updater.applyUpdate(); // quits (which stops the server), swaps in the new version, reopens
  else if (action === "check-update") void checkForUpdate(true);
  else openWindow(); // the "open" item, or a click on the icon itself
});

// Updates: look for a newer release at start and every 6 hours, download it quietly, then offer a restart in the menu.
// Asked for from the menu (`asked`), it also says how it went, and offers to restart right away.
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
