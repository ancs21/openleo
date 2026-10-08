// Small, quick jobs (an icon, a board's setup) go to a fast model on the account's ChatGPT sign-in.
import { models, resolveModel } from "./runtime";

const FAST_MODELS = ["openai/gpt-6-luna", "openai/gpt-5.6-luna"]; // first one this account can use

/** The fast model's text reply, or undefined when this account has none. Throws when the model fails. */
export async function askFast(systemPrompt: string, text: string): Promise<string | undefined> {
  const available = new Set((await models().getAvailable()).map((m) => `${m.provider}/${m.id}`));
  const id = FAST_MODELS.find((m) => available.has(m));
  if (!id) return;
  const reply = await models().completeSimple(resolveModel(id), {
    systemPrompt,
    messages: [{ role: "user", content: text, timestamp: Date.now() }],
  } as any);
  if (reply.stopReason === "error") throw new Error(reply.errorMessage ?? "the model didn't answer");
  return reply.content.filter((c: any) => c.type === "text").map((c: any) => c.text).join("").trim();
}
