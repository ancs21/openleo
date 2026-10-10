// `bun run release [version]`: the changelog's `next` notes become this version, dated today, and the app gets the
// same version. The version defaults to today's date as 0.<month>.<day>. Merging the change to main releases it.
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const CHANGELOG = join(root, "landing/changelog.json");
const CONFIG = join(root, "electrobun.config.ts");
type Changelog = { next: string[]; releases: { version: string; date: string; notes: string[] }[] };

const fail = (message: string) => { console.error(message); process.exit(1); };
const newer = (a: string, b: string) => {
  const [x, y] = [a, b].map((v) => v.split(".").map(Number));
  for (let i = 0; i < 3; i++) if (x![i] !== y![i]) return x![i]! > y![i]!;
  return false;
};

const now = new Date();
const version = Bun.argv[2] ?? `0.${now.getMonth() + 1}.${now.getDate()}`;
const changelog: Changelog = await Bun.file(CHANGELOG).json();
const latest = changelog.releases[0]?.version ?? "0.0.0";
if (!/^\d+\.\d+\.\d+$/.test(version)) fail(`"${version}" isn't a version like 0.10.12`);
const after = latest.replace(/\d+$/, (n) => String(Number(n) + 1));
if (!newer(version, latest)) fail(`${version} isn't newer than ${latest}: pass one that is, e.g. bun run release ${after}`);
if (!changelog.next.length) fail("Nothing to release: add notes to `next` in landing/changelog.json first.");

const config = await Bun.file(CONFIG).text();
if ((config.match(/version: "[^"]+"/g) ?? []).length !== 1) fail("expected one `version:` in electrobun.config.ts");
const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
changelog.releases.unshift({ version, date, notes: changelog.next });
changelog.next = [];
await Bun.write(CHANGELOG, `${JSON.stringify(changelog, null, 2)}\n`);
await Bun.write(CONFIG, config.replace(/version: "[^"]+"/, `version: "${version}"`));
console.log(`Version ${version}: electrobun.config.ts and the changelog. Commit it as "chore: release v${version}" and merge to main.`);
