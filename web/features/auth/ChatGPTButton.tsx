import type { ButtonHTMLAttributes } from "react";
import { Button } from "../../components/Button";
import { Spinner } from "../../components/motion";
import chatgptLogo from "../../assets/chatgpt-logo-white.svg";

/**
 * "Continue with ChatGPT", as OpenAI's Sign in with ChatGPT guidelines show it: the white ChatGPT logo
 * (official asset, unmodified) left of the label, on a dark button. While `busy`, a spinner takes the
 * logo's place and the button is disabled.
 */
export function ChatGPTButton({ className = "", children = "Continue with ChatGPT", busy = false, disabled, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { busy?: boolean }) {
  return (
    <Button variant="chatgpt" type="button" className={`gap-2 ${className}`} disabled={busy || disabled} aria-busy={busy} {...props}>
      {busy
        ? <Spinner className="size-[18px] border-white/30 border-t-white" />
        : <img src={chatgptLogo} alt="" aria-hidden="true" className="size-[18px] shrink-0" />}
      {children}
    </Button>
  );
}
