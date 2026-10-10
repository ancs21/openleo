import { useEffect, useRef } from "react";
import { EYES, pupilAt, RESTING } from "./logo-mark";

/** `follow`: the pupils follow the pointer around the page. */
export function Logo({ className = "size-6", follow = false }: { className?: string; follow?: boolean }) {
  const svg = useRef<SVGSVGElement>(null);
  const pupils = useRef<(SVGCircleElement | null)[]>([]);

  useEffect(() => {
    if (!follow || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const look = (e: PointerEvent) => {
      const box = svg.current?.getBoundingClientRect();
      if (!box) return;
      const scale = box.width / 64;
      EYES.forEach((eye, i) => {
        const dx = e.clientX - (box.left + eye[0] * scale), dy = e.clientY - (box.top + eye[1] * scale);
        const amount = Math.min(1, Math.hypot(dx, dy) / 120); // look less when the pointer is close
        const angle = Math.atan2(dy, dx);
        const p = pupilAt(eye, Math.cos(angle) * amount, Math.sin(angle) * amount);
        pupils.current[i]?.setAttribute("cx", String(p.cx));
        pupils.current[i]?.setAttribute("cy", String(p.cy));
      });
    };
    addEventListener("pointermove", look);
    return () => removeEventListener("pointermove", look);
  }, [follow]);

  return (
    <svg ref={svg} viewBox="0 0 64 64" className={`shrink-0 ${className}`} role="img" aria-label="OpenLeo">
      <circle cx="32" cy="32" r="32" fill="var(--ink)" />
      {EYES.map((eye, i) => {
        const rest = pupilAt(eye, RESTING.dx, RESTING.dy);
        return (
          <g key={i}>
            <circle cx={eye[0]} cy={eye[1]} r={eye[2]} fill="var(--surface)" />
            <circle ref={(el) => { pupils.current[i] = el; }} cx={rest.cx} cy={rest.cy} r={eye[3]} fill="var(--ink)" />
          </g>
        );
      })}
    </svg>
  );
}
