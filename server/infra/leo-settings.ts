// Leo's model and thinking time for this account (<tenant>/leo.json), chosen in its chat; a fast model by default.
import { readFileSync } from "node:fs";
import { LEO_MODEL, type Effort } from "../../shared/types";
import { dataDir } from "./tenant";

const settingsFile = () => `${dataDir()}/leo.json`;
type LeoSettings = { model: string; effort?: Effort };
/** The model and thinking time Leo uses on this account (chosen in its chat; a fast model by default). */
export function leoSettings(): LeoSettings {
  try { const s = JSON.parse(readFileSync(settingsFile(), "utf8")); return { model: s.model || LEO_MODEL, ...(s.effort ? { effort: s.effort } : {}) }; }
  catch { return { model: LEO_MODEL }; }
}
export const setLeoSettings = (s: LeoSettings) => Bun.write(settingsFile(), JSON.stringify(s));
