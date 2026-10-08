import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router";
import { useEscape, useLatest } from "../lib/hooks";
import { Icon, glyphs } from "./Icon";

type Box = { top: number; left: number; width: number; height: number; danger: boolean };
const EASE = "cubic-bezier(0.23,1,0.32,1)";

/**
 * Anchored menu/popover: renders `trigger`, and when `open`, the panel next to it. The panel lives in a layer
 * above the page (portal, fixed position), so a scrolling or clipped container (a dialog, a side panel) can't
 * cut it off; it opens upward when there's no room below, and follows the trigger on scroll and resize.
 * Closes on outside click and Esc. `align` picks which edge of the trigger the panel lines up with;
 * `matchWidth` makes it as wide as the trigger (a select).
 * Menu rows (MenuItem) share one highlight that glides to the hovered row.
 */
export function Popover({ open, onClose, trigger, children, align = "right", className = "w-48", matchWidth = false }: {
  open: boolean; onClose: () => void; trigger: ReactNode; children: ReactNode; align?: "left" | "right"; className?: string; matchWidth?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<{ style: CSSProperties; up: boolean }>();
  const [hover, setHover] = useState<{ box: Box; shown: boolean }>();
  useEscape(onClose, { enabled: open, exclusive: true });

  // Outside = not in the trigger, the panel, or a menu opened from the panel (a dropdown in a form). Those are in
  // different parts of the page, but React events still bubble through them to here, before the page's listener runs.
  const close = useLatest(onClose);
  const inside = useRef(false);
  useEffect(() => {
    if (!open) return;
    inside.current = false; // the press that opened it is done
    const onDown = () => {
      if (!inside.current) close.current();
      inside.current = false;
    };
    addEventListener("pointerdown", onDown);
    return () => removeEventListener("pointerdown", onDown);
  }, [open, close]);

  useLayoutEffect(() => {
    if (!open) return setPlace(undefined);
    const update = () => {
      const r = ref.current!.getBoundingClientRect();
      const h = panel.current?.offsetHeight ?? 0, gap = 4;
      const up = innerHeight - r.bottom < h + gap + 8 && r.top > innerHeight - r.bottom;
      setPlace({ up, style: {
        ...(align === "right" ? { right: innerWidth - r.right } : { left: r.left }),
        ...(up ? { bottom: innerHeight - r.top + gap } : { top: r.bottom + gap }),
        ...(matchWidth ? { width: r.width } : {}),
      } });
    };
    update();
    addEventListener("resize", update);
    addEventListener("scroll", update, true);
    return () => { removeEventListener("resize", update); removeEventListener("scroll", update, true); };
  }, [open, align, matchWidth]);

  const hide = () => setHover((h) => h && { ...h, shown: false });
  const track = (e: React.PointerEvent) => {
    const row = (e.target as Element).closest<HTMLElement>("[data-menu-row]");
    if (!row || (row as HTMLButtonElement).disabled) return hide();
    setHover({ box: { top: row.offsetTop, left: row.offsetLeft, width: row.offsetWidth, height: row.offsetHeight, danger: row.dataset.menuRow === "danger" }, shown: true });
  };
  const origin = `${place?.up ? "bottom" : "top"} ${align}`;

  return (
    <div ref={ref} className="relative" onPointerDown={() => { inside.current = true; }}>
      {trigger}
      {open && createPortal(
        <div ref={panel} onPointerOver={track} onPointerLeave={hide} style={{ ...place?.style, transformOrigin: origin, visibility: place ? "visible" : "hidden" }}
          className={`fixed z-[95] animate-pop-in rounded-[10px] bg-surface p-1 shadow-overlay ${className}`}>
          {hover && (
            <span aria-hidden className={`pointer-events-none absolute rounded-[6px] ${hover.box.danger ? "bg-red-tint" : "bg-hover"}`}
              style={{
                ...hover.box, opacity: hover.shown ? 1 : 0,
                // glide between rows while shown; appear in place when the pointer comes back in
                transition: hover.shown ? `top 220ms ${EASE}, height 220ms ${EASE}, opacity 150ms ease` : "opacity 150ms ease",
              }} />
          )}
          {children}
        </div>,
        ref.current?.closest("dialog") ?? document.body, // a modal dialog covers the page: a menu in one opens inside it
      )}
    </div>
  );
}

/**
 * A row in a Popover menu: a link with `to`, otherwise a button. `checked` makes it one choice of several
 * (a check marks the current one); `extra` sits at the right edge (e.g. a count).
 */
export function MenuItem({ onClick, to, children, icon, extra, danger = false, checked, disabled, title }: {
  onClick?: () => void; to?: string; children: ReactNode; icon?: ReactNode; extra?: ReactNode; danger?: boolean; checked?: boolean; disabled?: boolean; title?: string;
}) {
  const body = <>
    {icon}
    <span className="min-w-0 flex-1 truncate">{children}</span>
    {extra}
    {checked !== undefined && <span className={checked ? "" : "invisible"}><Icon size={13} strokeWidth={2.5}>{glyphs.check}</Icon></span>}
  </>;
  const props = {
    "data-menu-row": danger ? "danger" : "", title, onClick,
    className: `relative flex h-7.5 w-full items-center gap-2 rounded-[6px] px-2 text-left text-[12.5px] font-medium ${danger ? "text-red" : "text-ink"} disabled:cursor-not-allowed disabled:opacity-50`,
  };
  return to
    ? <Link to={to} {...props}>{body}</Link>
    : <button type="button" role={checked === undefined ? "menuitem" : "menuitemradio"} aria-checked={checked} disabled={disabled} {...props}>{body}</button>;
}
