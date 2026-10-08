import { Button } from "../../components/Button";
import { ChatGPTButton } from "./ChatGPTButton";
import { USAGE_URL, useApp } from "../../stores/app-store";

/** Sign-in card for using a ChatGPT plan with OpenAI models. */
export function ChatGPTCard() {
  const chatgpt = useApp((s) => s.chatgpt);
  const signIn = useApp((s) => s.signIn);
  const signOut = useApp((s) => s.signOut);
  return (
    <div className="rounded-card bg-surface p-3 shadow-card">
      <div className="text-[13px] font-semibold">Use your ChatGPT plan</div>
      <p className="mt-1 mb-2.5 text-[12.5px] leading-snug text-ink-2">
        {chatgpt.signedIn
          ? <>Signed in{chatgpt.email && <> as <span className="text-ink">{chatgpt.email}</span></>}. OpenAI models use your ChatGPT plan. <a className="text-accent-ink underline underline-offset-2" href={USAGE_URL} target="_blank" rel="noopener">Manage usage</a></>
          : chatgpt.error ? <span className="text-red">Sign-in failed: {chatgpt.error}</span>
          : "Run agents on OpenAI models with usage included in your ChatGPT plan or credits balance."}
      </p>
      {chatgpt.signedIn
        ? <Button className="w-full" onClick={() => void signOut()}>Sign out</Button>
        : <ChatGPTButton className="w-full" busy={!!chatgpt.pending} onClick={() => void signIn()} />}
    </div>
  );
}
