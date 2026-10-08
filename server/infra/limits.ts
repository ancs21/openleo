// Per-account limits, so one account can't use up this machine. The install owner has none.
// The numbers are settings (infra/config.ts).
import { lstatSync, readdirSync } from "node:fs";
import { currentTenant, dataDir, isOwner } from "./tenant";

import { LIMITS } from "./config";

export const unlimited = () => isOwner(currentTenant());

/** A limit was reached: the message says what to do about it. */
export class LimitError extends Error {}

export function checkBoards(count: number) {
  if (!unlimited() && count >= LIMITS.boards) throw new LimitError(`You can have up to ${LIMITS.boards} boards. Delete one to add another.`);
}

export function checkRuns(running: number) {
  if (!unlimited() && running >= LIMITS.runs) throw new LimitError(`Up to ${LIMITS.runs} agents can work at once. Wait for one to finish, or stop one.`);
}

/** Bytes in a folder (files only; links aren't followed). */
export function folderBytes(dir: string): number {
  let total = 0;
  for (const name of readdirSync(dir)) {
    const st = lstatSync(`${dir}/${name}`);
    if (st.isDirectory()) total += folderBytes(`${dir}/${name}`);
    else if (st.isFile()) total += st.size;
  }
  return total;
}

// Measured at most once a minute per account: walking the folder on every request would be wasteful.
const measured = new Map<string, { bytes: number; at: number }>();
export function storageBytes() {
  const tenant = currentTenant();
  const m = measured.get(tenant);
  if (m && Date.now() - m.at < 60_000) return m.bytes;
  const bytes = folderBytes(dataDir());
  measured.set(tenant, { bytes, at: Date.now() });
  return bytes;
}

export function checkStorage() {
  if (!unlimited() && storageBytes() > LIMITS.storageMb * 1024 * 1024) {
    throw new LimitError(`Your OpenLeo storage is full (${LIMITS.storageMb} MB). Delete old chats, boards or files to keep working.`);
  }
}

/** Computer size for this account (undefined: cua's default, for the owner). */
export const computerSize = () => (unlimited() ? {} : { cpus: LIMITS.computerCpus, memoryMb: BigInt(LIMITS.computerMemoryMb) });
