import { useEffect, useRef } from "react";
import { dropTargetForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";

/** A drop target itself, so hovering it keeps the slot instead of resolving to the list below and flickering. */
export function Placeholder({ height, width }: { height: number; width?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => dropTargetForElements({ element: ref.current!, getData: () => ({ type: "placeholder" }) }), []);
  return (
    <div ref={ref} aria-hidden className="shrink-0 rounded-[10px] border-2 border-dashed border-accent/60 bg-accent-tint"
      style={{ height, width }} />
  );
}
