// Regenerate the logo files from web/components/logo-mark.ts: the favicon (web/assets/logo.svg), the app
// icon source (desktop/icon.svg), the macOS icon set (desktop/icon.iconset) and the menu bar icon
// (desktop/tray.png, a template image). macOS only: renders with headless Chrome and resizes with sips.
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { markSvg, templateSvg } from "../web/components/logo-mark";

await Bun.write("web/assets/logo.svg", markSvg({ size: 64, fill: "#18181b" }));
await Bun.write("desktop/icon.svg", markSvg({
  size: 1024, inset: 100, // an 824 px circle: the macOS icon grid
  fill: "url(#g)",
  defs: `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a2a30"/><stop offset="1" stop-color="#121214"/></linearGradient></defs>`,
}));

const tmp = mkdtempSync(join(tmpdir(), "openleo-icon-"));
const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

/** Render an SVG file to a transparent 1024 px PNG with headless Chrome. */
async function render(svgPath: string, png: string) {
  // Headless Chrome sometimes lingers after writing the screenshot: stop it once the file is there.
  const browser = Bun.spawn([chrome, "--headless=new", "--disable-gpu", `--user-data-dir=${tmp}/profile`, "--hide-scrollbars",
    "--default-background-color=00000000", "--window-size=1024,1024", `--screenshot=${png}`, `file://${resolve(svgPath)}`], { stdout: "ignore", stderr: "ignore" });
  for (let i = 0; i < 300 && !(await Bun.file(png).exists()); i++) await Bun.sleep(100);
  await Bun.sleep(300); // let the write finish
  browser.kill();
  if (!(await Bun.file(png).exists())) throw new Error(`Chrome didn't render ${svgPath}`);
}

const png = join(tmp, "icon-1024.png");
await render("desktop/icon.svg", png);

const set = "desktop/icon.iconset";
rmSync(set, { recursive: true, force: true });
mkdirSync(set);
for (const s of [16, 32, 128, 256, 512]) {
  await Bun.$`sips -z ${s} ${s} ${png} --out ${set}/icon_${s}x${s}.png`.quiet();
  await Bun.$`sips -z ${s * 2} ${s * 2} ${png} --out ${set}/icon_${s}x${s}@2x.png`.quiet();
}
// Menu bar: 16 pt, so 32 px for Retina screens.
const traySvg = join(tmp, "tray.svg"), trayPng = join(tmp, "tray-1024.png");
await Bun.write(traySvg, templateSvg(1024));
await render(traySvg, trayPng);
await Bun.$`sips -z 32 32 ${trayPng} --out desktop/tray.png`.quiet();

rmSync(tmp, { recursive: true, force: true });
console.log("wrote web/assets/logo.svg, desktop/icon.svg, desktop/icon.iconset, desktop/tray.png");
