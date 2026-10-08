// Small DOM hooks shared across features.
import { useEffect, useRef, type RefObject } from "react";

/** Call `handler` with the latest closure without re-subscribing every render. */
export function useLatest<T>(value: T) {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}

/**
 * Esc anywhere (skipped while typing in a field when `ignoreFields`).
 * `exclusive` handles it first and stops it, so an open menu closes without also closing the panel under it.
 */
export function useEscape(handler: () => void, { enabled = true, ignoreFields = false, exclusive = false } = {}) {
  const fn = useLatest(handler);
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (ignoreFields && (e.target as HTMLElement | null)?.closest("input,textarea,select")) return;
      if (exclusive) e.stopImmediatePropagation();
      fn.current();
    };
    addEventListener("keydown", onKey, { capture: exclusive });
    return () => removeEventListener("keydown", onKey, { capture: exclusive });
  }, [enabled, ignoreFields, exclusive, fn]);
}

/** ⌘/Ctrl + key. */
export function useHotkey(key: string, handler: () => void) {
  const fn = useLatest(handler);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === key) { e.preventDefault(); fn.current(); }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [key, fn]);
}

/** Pointer-down outside `ref` (e.g. to close a menu). */
export function useClickOutside(ref: RefObject<Element | null>, handler: () => void, enabled = true) {
  const fn = useLatest(handler);
  useEffect(() => {
    if (!enabled) return;
    const onDown = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) fn.current(); };
    addEventListener("pointerdown", onDown);
    return () => removeEventListener("pointerdown", onDown);
  }, [enabled, ref, fn]);
}
