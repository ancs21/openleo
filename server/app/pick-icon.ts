// Pick an icon for a name (a list's title, an agent's name and description) with the fast model.
import { ICONS } from "../../shared/icons";
import { askFast } from "../infra/fast";

const NAMES = Object.keys(ICONS);
const PROMPT = `Pick the one icon that best fits what the user describes. Reply with exactly one name copied from this list, nothing else:
${NAMES.join(", ")}`;

/** An icon name from shared/icons.ts, or undefined when no fast model is signed in or nothing fits. */
export async function pickIcon(text: string): Promise<string | undefined> {
  if (!text.trim()) return;
  const name = (await askFast(PROMPT, text.slice(0, 500)))?.toLowerCase();
  if (!name) return;
  // A name that isn't in the set ("check-square") falls back to one of the same kind ("check-circle").
  return NAMES.includes(name) ? name : NAMES.find((n) => n.split("-")[0] === name.split("-")[0]);
}
