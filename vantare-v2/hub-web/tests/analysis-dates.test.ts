import { afterEach, expect, it, vi } from "vitest";
import {
  recordingGroup,
  recordingGroups,
} from "../src/renderer/app/analysis-dates";
import { recordingDate } from "../src/renderer/i18n/analysis.es";

const at = (day: number, hour = 0, minute = 0) =>
  new Date(2026, 10, day, hour, minute).getTime();
const now = at(17, 12);
afterEach(() => vi.unstubAllEnvs());
it("uses exactly four calendar groups and an injected current date", () => {
  expect(recordingGroups).toEqual(["today", "yesterday", "week", "older"]);
  expect(recordingGroup(at(17), now)).toBe("today");
  expect(recordingGroup(at(16, 23, 59), now)).toBe("yesterday");
  expect(recordingGroup(at(16), now)).toBe("yesterday");
  expect(recordingGroup(at(15, 23, 59), now)).toBe("week");
  expect(recordingGroup(at(11), now)).toBe("week");
  expect(recordingGroup(at(10, 23, 59), now)).toBe("older");
  expect(recordingGroup(at(3), now)).toBe("older");
  expect(recordingGroup(at(17), at(18))).toBe("yesterday");
});
it("formats the approved one-line date variants without repeating the year", () => {
  expect(recordingDate(at(17, 18, 42), now)).toBe("18:42");
  expect(recordingDate(at(16, 21, 10), now)).toBe("21:10");
  expect(recordingDate(at(14, 17, 30), now)).toBe("sáb 14, 17:30");
  expect(recordingDate(at(3, 19, 40), now)).toBe("3 nov, 19:40");
  expect(recordingDate(new Date(2025, 10, 3, 19, 40).getTime(), now)).toBe(
    "3 nov 2025, 19:40",
  );
});
it("keeps yesterday correct across month/year boundaries and includes the previous year", () => {
  const jan = new Date(2026, 0, 1, 0, 1).getTime();
  const dec = new Date(2025, 11, 31, 23, 59).getTime();
  expect(recordingGroup(dec, jan)).toBe("yesterday");
  expect(recordingDate(dec, jan)).toBe("31 dic 2025, 23:59");
  expect(
    recordingGroup(
      new Date(2026, 9, 31).getTime(),
      new Date(2026, 10, 1).getTime(),
    ),
  ).toBe("yesterday");
});
it.each([
  [2, 30, 29, 23],
  [9, 26, 25, 25],
])(
  "uses calendar days through DST in month %s",
  (month, today, yesterday, hours) => {
    vi.stubEnv("TZ", "Europe/Madrid");
    const current = new Date(2026, month, today, 0, 30).getTime();
    const previous = new Date(2026, month, yesterday, 0, 30).getTime();
    expect((current - previous) / 3_600_000).toBe(hours);
    expect(recordingGroup(previous, current)).toBe("yesterday");
  },
);
