// Light / dark / system theme via a .dark class on <html>.
import { useSyncExternalStore } from "react";
import { storage } from "./storage";

export type Theme = "light" | "dark" | "system";
const KEY = "openleo-theme";
const media = matchMedia("(prefers-color-scheme: dark)");
const listeners = new Set<() => void>();

export const getTheme = (): Theme => {
  const t = storage.get(KEY);
  return t === "light" || t === "dark" ? t : "system";
};

function apply() {
  const t = getTheme();
  const dark = t === "dark" || (t === "system" && media.matches);
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
}

export function setTheme(t: Theme) {
  if (t === "system") storage.remove(KEY); else storage.set(KEY, t);
  apply();
  listeners.forEach((l) => l());
}

media.addEventListener("change", () => { if (getTheme() === "system") { apply(); listeners.forEach((l) => l()); } });

const subscribe = (l: () => void) => (listeners.add(l), () => listeners.delete(l));
export const isDark = () => getTheme() === "dark" || (getTheme() === "system" && media.matches);

export const useTheme = () => useSyncExternalStore(subscribe, getTheme, (): Theme => "system"); // a page rendered ahead of time follows the system

export const useIsDark = () => useSyncExternalStore(subscribe, isDark, () => false);
