import type { ButtonHTMLAttributes } from "react";

const variants = {
  primary: "bg-ink text-surface hover:opacity-90",
  secondary: "bg-surface text-ink shadow-btn hover:bg-hover",
  danger: "bg-red-tint text-red hover:opacity-90",
  chatgpt: "bg-black text-white hover:bg-neutral-800 dark:shadow-btn",
  accent: "bg-accent text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.14)] hover:brightness-95",
};

/** A button's look, for a link that acts as a button (download, open elsewhere). */
export const buttonClass = (variant: keyof typeof variants = "secondary") =>
  `inline-flex h-8 items-center justify-center gap-1.5 rounded-control px-3 text-[13px] font-medium transition-[background-color,transform,opacity] duration-150 active:scale-[0.98] disabled:opacity-50 ${variants[variant]}`;

export function Button({ variant = "secondary", className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof variants }) {
  return <button {...props} className={`${buttonClass(variant)} ${className}`} />;
}
