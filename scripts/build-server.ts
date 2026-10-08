// Compile the OpenLeo server (API, web UI with its styles) into one executable for the desktop app:
// dist/openleo-server, plus the native cua library it loads at runtime (dist/node_modules/@trycua/…).
import { cpSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import tailwind from "bun-plugin-tailwind";

const result = await Bun.build({
  entrypoints: ["server/main.ts"],
  compile: { outfile: process.platform === "win32" ? "dist/openleo-server.exe" : "dist/openleo-server" },
  plugins: [tailwind],
  minify: true,
  define: { "process.env.NODE_ENV": JSON.stringify("production") }, // the server and the pages it bundles run as production
  sourcemap: "linked",
});
if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}
// The cua SDK finds its native library by package name, so it ships as a package next to the server.
// Only the library files (.dylib, .so or .dll): the platform package's `cua` command-line tool isn't used.
const suffix = { linux: "-gnu", win32: "-msvc" }[process.platform as string] ?? "";
const pkg = `@trycua/cua-${process.platform}-${process.arch}${suffix}`;
const from = `node_modules/${pkg}`, to = `dist/node_modules/${pkg}`;
rmSync("dist/node_modules", { recursive: true, force: true });
mkdirSync(to, { recursive: true });
for (const f of readdirSync(from)) if (f !== "cua" && f !== "cua.exe") cpSync(`${from}/${f}`, `${to}/${f}`);

console.log("built dist/openleo-server and dist/node_modules");
