// The OpenLeo mark: "Oo" drawn as two eyes, a big O and a small o, in a circle (a 64×64 unit square).
// Used by <Logo> and by scripts/build-icons.ts, which writes the favicon and the app icon.

/** [cx, cy, eye radius, pupil radius] */
export const EYES = [[23, 33, 13, 5.5], [45.5, 37, 8.5, 3.6]] as const;
type Eye = (typeof EYES)[number];

/** Where a pupil sits when looking along (dx, dy), each -1..1: up to the eye's rim, minus a margin. */
export function pupilAt([cx, cy, r, p]: Eye, dx: number, dy: number) {
  const reach = r - p - 1.5;
  return { cx: cx + dx * reach, cy: cy + dy * reach };
}

/** At rest the pupils glance up and to the right, curious. */
export const RESTING = { dx: 0.35, dy: -0.35 };

/** Both eyes at rest as SVG circles, in the 64-unit square. */
function restingEyes(eyeFill: string, pupilFill: string) {
  return EYES.map((e) => {
    const p = pupilAt(e, RESTING.dx, RESTING.dy);
    return `<circle cx="${e[0]}" cy="${e[1]}" r="${e[2]}" fill="${eyeFill}"/><circle cx="${p.cx}" cy="${p.cy}" r="${e[3]}" fill="${pupilFill}"/>`;
  }).join("");
}

/**
 * The mark as a standalone SVG file. `inset` leaves a margin around the circle (the macOS icon grid);
 * `fill` paints the circle and may reference a gradient given in `defs`.
 */
export function markSvg({ size, inset = 0, fill, defs = "", eye = "#fff", pupil = "#18181b" }: {
  size: number; inset?: number; fill: string; defs?: string; eye?: string; pupil?: string;
}) {
  const r = size / 2 - inset;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${defs}`
    + `<circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="${fill}"/>`
    + `<g transform="translate(${inset} ${inset}) scale(${(2 * r) / 64})">${restingEyes(eye, pupil)}</g></svg>\n`;
}

/**
 * The mark as a one-colour macOS template image for the menu bar: a solid circle with the eyes cut out and
 * the pupils inside them. macOS paints the opaque parts to suit a light or dark menu bar.
 */
export function templateSvg(size: number) {
  const holes = restingEyes("#000", "#fff"); // in the mask: black cuts the eyes out, white keeps the pupils
  // A small margin keeps the circle's edge off the image border, which would leave stray pixels when scaled down.
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="-3 -3 70 70">`
    + `<defs><mask id="eyes"><rect x="-3" y="-3" width="70" height="70" fill="#fff"/>${holes}</mask></defs>`
    + `<circle cx="32" cy="32" r="32" fill="#000" mask="url(#eyes)"/></svg>\n`;
}
