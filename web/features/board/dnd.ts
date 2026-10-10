import { preserveOffsetOnSource } from "@atlaskit/pragmatic-drag-and-drop/utils/preserve-offset-on-source";
import { setCustomNativeDragPreview } from "@atlaskit/pragmatic-drag-and-drop/utils/set-custom-native-drag-preview";
import type { DragSource, DropTarget, Edge } from "./model";

// Own closest-edge hitbox: the hitbox package's circular re-exports break Bun's bundler.
const EDGE = Symbol("closestEdge");

/** Attach the edge of `element` nearest the pointer (among `allowedEdges`) to drop-target data. */
export function attachClosestEdge<T extends Record<string | symbol, unknown>>(data: T, { input, element, allowedEdges }: {
  input: { clientX: number; clientY: number }; element: Element; allowedEdges: Edge[];
}): T {
  const r = element.getBoundingClientRect();
  const distance: Record<Edge, number> = {
    top: Math.abs(input.clientY - r.top), bottom: Math.abs(r.bottom - input.clientY),
    left: Math.abs(input.clientX - r.left), right: Math.abs(r.right - input.clientX),
  };
  const edge = allowedEdges.reduce((best, e) => (distance[e] < distance[best] ? e : best));
  return { ...data, [EDGE]: edge };
}

export const extractClosestEdge = (data: Record<string | symbol, unknown>): Edge | null => (data[EDGE] as Edge | undefined) ?? null;

type PreviewArgs = { element: HTMLElement; input: { clientX: number; clientY: number }; nativeSetDragImage: ((image: Element, x: number, y: number) => void) | null };

export function tiltedPreview({ element, input, nativeSetDragImage }: PreviewArgs, tilt = 2.5) {
  setCustomNativeDragPreview({
    nativeSetDragImage,
    getOffset: preserveOffsetOnSource({ element, input: input as any }),
    render({ container }) {
      const clone = element.cloneNode(true) as HTMLElement;
      Object.assign(clone.style, {
        width: `${element.offsetWidth}px`, height: `${element.offsetHeight}px`, opacity: "1",
        transform: `rotate(${tilt}deg)`, boxShadow: "var(--sh-overlay)", pointerEvents: "none",
      });
      container.appendChild(clone);
    },
  });
}

export const asSource = (data: Record<string | symbol, unknown>) => data as unknown as DragSource;
export const asTarget = (data: Record<string | symbol, unknown> | undefined): DropTarget | undefined =>
  data ? ({ ...(data as object), edge: extractClosestEdge(data) } as DropTarget) : undefined;
