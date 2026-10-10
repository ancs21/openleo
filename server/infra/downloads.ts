// Saving a file to the Downloads folder (the Mac app's web view can't download), then showing it in Finder or Explorer.
import { existsSync } from "node:fs";
import { homedir } from "node:os";

/** Never overwrites; returns the saved path. */
export async function saveToDownloads(fileName: string, bytes: Uint8Array) {
  const name = fileName.replace(/[^\w.\- ]/g, "_");
  const dot = name.lastIndexOf("."), stem = dot > 0 ? name.slice(0, dot) : name, ext = dot > 0 ? name.slice(dot) : "";
  let to = `${homedir()}/Downloads/${name}`;
  for (let i = 2; existsSync(to); i++) to = `${homedir()}/Downloads/${stem} (${i})${ext}`;
  await Bun.write(to, bytes);
  if (process.platform === "darwin") Bun.spawn(["open", "-R", to]);
  else if (process.platform === "win32") Bun.spawn(["explorer", `/select,${to.replaceAll("/", "\\")}`]);
  return to;
}
