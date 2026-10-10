import { chmod, rename } from "node:fs/promises";

// Owner-only write via a temp file chmod'ed before rename (Bun.write ignores modes): never readable by others,
// even briefly, and a crash mid-write keeps the old version.
export async function writePrivate(path: string, data: string) {
  const tmp = `${path}.${process.pid}.${crypto.randomUUID().slice(0, 8)}.tmp`;
  await Bun.write(tmp, data, { createPath: true });
  await chmod(tmp, 0o600);
  await rename(tmp, path);
}
