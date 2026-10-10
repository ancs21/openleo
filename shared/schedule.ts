// Card schedules: every N minutes, or at a wall-clock time on chosen weekdays in an IANA zone (so DST follows the clock).

export const MIN_MINUTES = 5; // each run uses the plan's usage

export type Schedule = {
  agent: string;
  /** IANA zone, e.g. "Asia/Ho_Chi_Minh" */
  zone: string;
  paused?: boolean;
} & ({ minutes: number } | { at: string; days: number[] }); // days: 0 = Sunday … 6 = Saturday

const DAY_MS = 86_400_000;
const AT = /^([01]\d|2[0-3]):[0-5]\d$/;

export function parseSchedule(v: any): Schedule | null {
  if (!v || typeof v.agent !== "string" || !v.agent || typeof v.zone !== "string" || !validZone(v.zone)) return null;
  const base = { agent: v.agent, zone: v.zone, ...(v.paused === true ? { paused: true } : {}) };
  if (typeof v.minutes === "number") return Number.isInteger(v.minutes) && v.minutes >= MIN_MINUTES && v.minutes <= 7 * 24 * 60 ? { ...base, minutes: v.minutes } : null;
  if (typeof v.at !== "string" || !AT.test(v.at) || !Array.isArray(v.days)) return null;
  const days = [...new Set(v.days)].filter((d): d is number => Number.isInteger(d) && (d as number) >= 0 && (d as number) <= 6).sort();
  return days.length ? { ...base, at: v.at, days } : null;
}

function validZone(zone: string) {
  try { new Intl.DateTimeFormat("en-US", { timeZone: zone }); return true; } catch { return false; }
}

function wallClock(t: number, zone: string) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: zone, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric", weekday: "short",
  }).formatToParts(t).map((x) => [x.type, x.value]));
  return { y: +p.year!, m: +p.month!, d: +p.day!, h: +p.hour!, min: +p.minute!, s: +p.second!, wd: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday!) };
}

/** A time skipped by a DST jump lands just after the jump. */
function instantOf(y: number, m: number, d: number, h: number, min: number, zone: string) {
  const want = Date.UTC(y, m - 1, d, h, min);
  let t = want;
  for (let i = 0; i < 2; i++) { // the zone's offset at the guess, then at the corrected guess
    const w = wallClock(t, zone);
    t += want - Date.UTC(w.y, w.m - 1, w.d, w.h, w.min, w.s);
  }
  return t;
}

/** The first run strictly after `after`. `last` (an interval's previous run) keeps intervals on their beat. */
export function nextRun(s: Schedule, after: number, last?: number): number {
  if ("minutes" in s) {
    const step = s.minutes * 60_000;
    return last && last + step > after ? last + step : after + step;
  }
  const [h, min] = s.at.split(":").map(Number) as [number, number];
  for (let i = 0; i <= 8; i++) { // a week covers every weekday; one more for "today, but the time has passed"
    const day = wallClock(after + i * DAY_MS, s.zone);
    if (!s.days.includes(day.wd)) continue;
    const t = instantOf(day.y, day.m, day.d, h, min, s.zone);
    if (t > after) return t;
  }
  throw new Error("schedule has no next run");
}

const NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "Every 30 minutes", "Daily at 09:00", "Weekdays at 09:00", "Mon, Thu at 18:30". */
export function describeSchedule(s: Schedule) {
  if ("minutes" in s) return s.minutes % 60 === 0 ? `Every ${s.minutes === 60 ? "hour" : `${s.minutes / 60} hours`}` : `Every ${s.minutes} minutes`;
  const key = s.days.join("");
  const when = key === "0123456" ? "Daily" : key === "12345" ? "Weekdays" : s.days.map((d) => NAMES[d]).join(", ");
  return `${when} at ${s.at}`;
}
