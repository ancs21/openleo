import { chmod, rename } from "node:fs/promises";

/**
 * Write a file only its owner can read (tokens, keys, sessions). The data goes to a temporary file that is
 * made owner-only before it replaces the real one, so the file is never readable by others, even briefly,
 * and a crash mid-write leaves the old version intact. Bun.write ignores file modes, hence the chmod.
 */
export async function writePrivate(path: string, data: string) {
  const tmp = `${path}.${process.pid}.${crypto.randomUUID().slice(0, 8)}.tmp`;
  await Bun.write(tmp, data, { createPath: true });
  await chmod(tmp, 0o600);
  await rename(tmp, path);
}
