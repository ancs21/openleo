import { expect, test } from "bun:test";
import { describeSchedule, nextRun, parseSchedule, type Schedule } from "./schedule";

const daily = (at: string, days: number[], zone = "UTC"): Schedule => ({ agent: "a", zone, at, days });

test("daily: later today, else tomorrow", () => {
  const s = daily("09:00", [0, 1, 2, 3, 4, 5, 6]);
  expect(nextRun(s, Date.UTC(2026, 9, 7, 8, 0))).toBe(Date.UTC(2026, 9, 7, 9, 0));
  expect(nextRun(s, Date.UTC(2026, 9, 7, 9, 0))).toBe(Date.UTC(2026, 9, 8, 9, 0)); // strictly after
});

test("weekdays skip the weekend (2026-10-09 is a Friday)", () => {
  expect(nextRun(daily("09:00", [1, 2, 3, 4, 5]), Date.UTC(2026, 9, 9, 10, 0))).toBe(Date.UTC(2026, 9, 12, 9, 0));
});

test("time zones: 09:00 in Ho Chi Minh City is 02:00 UTC", () => {
  expect(nextRun(daily("09:00", [0, 1, 2, 3, 4, 5, 6], "Asia/Ho_Chi_Minh"), Date.UTC(2026, 9, 7, 0, 0))).toBe(Date.UTC(2026, 9, 7, 2, 0));
});

test("DST: 09:00 New York stays 09:00 local across the November change", () => {
  const s = daily("09:00", [0, 1, 2, 3, 4, 5, 6], "America/New_York");
  expect(nextRun(s, Date.UTC(2026, 9, 31, 14, 0))).toBe(Date.UTC(2026, 10, 1, 14, 0)); // after 10:00 EDT: Nov 1, now EST (UTC-5)
  expect(nextRun(s, Date.UTC(2026, 9, 30, 12, 0))).toBe(Date.UTC(2026, 9, 30, 13, 0)); // 08:00 EDT: 09:00 the same day, UTC-4
});

test("intervals keep their beat, and a run long overdue comes once, then on from now", () => {
  const s: Schedule = { agent: "a", zone: "UTC", minutes: 30 };
  const t = Date.UTC(2026, 9, 7, 9, 0);
  expect(nextRun(s, t + 60_000, t)).toBe(t + 30 * 60_000);
  expect(nextRun(s, t + 5 * 3600_000, t)).toBe(t + 5 * 3600_000 + 30 * 60_000);
});

test("parse rejects what would loop or never run", () => {
  expect(parseSchedule({ agent: "a", zone: "UTC", minutes: 1 })).toBeNull(); // under the minimum
  expect(parseSchedule({ agent: "a", zone: "UTC", minutes: 5 })).toEqual({ agent: "a", zone: "UTC", minutes: 5 });
  expect(parseSchedule({ agent: "a", zone: "UTC", at: "25:00", days: [1] })).toBeNull();
  expect(parseSchedule({ agent: "a", zone: "UTC", at: "09:00", days: [] })).toBeNull();
  expect(parseSchedule({ agent: "a", zone: "Mars/Base", minutes: 60 })).toBeNull();
  expect(parseSchedule({ agent: "a", zone: "UTC", at: "09:00", days: [5, 1, 1, 9] })).toEqual({ agent: "a", zone: "UTC", at: "09:00", days: [1, 5] });
});

test("descriptions", () => {
  expect(describeSchedule(daily("09:00", [1, 2, 3, 4, 5]))).toBe("Weekdays at 09:00");
  expect(describeSchedule(daily("18:30", [1, 4]))).toBe("Mon, Thu at 18:30");
  expect(describeSchedule({ agent: "a", zone: "UTC", minutes: 120 })).toBe("Every 2 hours");
});
