import { usePanels, type Panel } from "../stores/panels";

const MIN = 360;

/** The left edge of a side panel: drag it to make the panel wider or narrower (remembered); double-click for the default width. */
export function PanelResizer({ panel, offset = 0 }: { panel: Panel; /** px between the panel's right edge and the window's (another panel) */ offset?: number }) {
  const setPanelWidth = usePanels((s) => s.setPanelWidth);
  const widthAt = (x: number) => Math.round(Math.min(Math.max(innerWidth - 12 - offset - x, MIN), innerWidth - 24 - offset));
  return (
    <div role="separator" aria-orientation="vertical" aria-label="Resize panel" title="Drag to resize · double-click to reset"
      onPointerDown={(e) => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); }}
      onPointerMove={(e) => { if (e.currentTarget.hasPointerCapture(e.pointerId)) setPanelWidth(panel, widthAt(e.clientX)); }}
      onDoubleClick={() => setPanelWidth(panel, undefined)}
      className="group absolute inset-y-0 left-0 z-10 w-2 cursor-col-resize touch-none">
      <span className="absolute inset-y-3 left-0.5 w-0.5 rounded-full bg-accent opacity-0 transition-opacity duration-150 group-hover:opacity-60 group-active:opacity-100" />
    </div>
  );
}
