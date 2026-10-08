import type { ButtonHTMLAttributes } from "react";

/** Square ghost button for an icon (always give it an aria-label). */
export function IconButton({ size = "md", className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { size?: "sm" | "md"; "aria-label": string }) {
  return (
    <button type="button" {...props}
      className={`inline-flex shrink-0 items-center justify-center rounded-[8px] text-ink-2 transition-colors duration-100 hover:bg-hover hover:text-ink ${size === "sm" ? "size-7" : "size-8"} ${className}`} />
  );
}
