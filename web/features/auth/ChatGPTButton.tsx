import type { ButtonHTMLAttributes } from "react";
import { Button } from "../../components/Button";
import { Spinner } from "../../components/motion";
import chatgptLogo from "../../assets/chatgpt-logo-white.svg";

/** Follows OpenAI's sign-in button guidelines (logo unmodified); a spinner replaces the logo while `busy`. */
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
