/** "openai/gpt-5.5" → "gpt-5.5" */
export const modelName = (id: string) => id.split("/").slice(1).join("/");
/** "openai/gpt-6.1-sol" -> "GPT-6.1 Sol"; other models keep their id. */
export function modelLabel(id: string) {
  const name = modelName(id) || id;
  const gpt = /^gpt-([\d.]+)(?:-(.+))?$/i.exec(name);
  return gpt ? `GPT-${gpt[1]}${gpt[2] ? ` ${gpt[2].split("-").map((w) => w[0]!.toUpperCase() + w.slice(1)).join(" ")}` : ""}` : name;
}
/** "openai/gpt-5.5" → "openai" */
export const providerOf = (id: string) => id.split("/")[0] ?? "";

/** "just now", "5m ago", "3h ago", "2d ago" */
export function timeAgo(t?: number) {
  if (!t) return "Never";
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

/** "Account Manager" -> "account-manager" */
export const toId = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+/, "").slice(0, 40);

export const agentId = (title: string) => toId(title.trim()).replace(/-+$/, "");
