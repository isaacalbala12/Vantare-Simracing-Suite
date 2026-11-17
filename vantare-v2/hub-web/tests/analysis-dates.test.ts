import { expect, it } from "vitest";
import {
  nextRecordingDay,
  recordingGroup,
  recordingGroups,
} from "../src/renderer/app/analysis-dates";
import { recordingDate } from "../src/renderer/i18n/analysis.es";

const at = (day: number, hour = 0, minute = 0) =>
  Date.UTC(2026, 10, day, hour, minute);
const now = at(17, 12);
const group = (start: number, current = now) =>
  recordingGroup(start, current, "UTC");
const formatted = (start: number, current = now) =>
  recordingDate(start, current, "UTC");
it("uses exactly four calendar groups and an injected current date", () => {
  expect(recordingGroups).toEqual(["today", "yesterday", "week", "older"]);
  expect(group(at(17))).toBe("today");
  expect(group(at(16, 23, 59))).toBe("yesterday");
  expect(group(at(16))).toBe("yesterday");
  expect(group(at(15, 23, 59))).toBe("week");
  expect(group(at(11))).toBe("week");
  expect(group(at(10, 23, 59))).toBe("older");
  expect(group(at(3))).toBe("older");
  expect(group(at(17), at(18))).toBe("yesterday");
});
it("formats the approved Spanish one-line variants in an explicit zone", () => {
  expect(formatted(at(17, 18, 42))).toBe("18:42");
  expect(formatted(at(16, 21, 10))).toBe("21:10");
  expect(formatted(at(14, 17, 30))).toBe("sáb 14, 17:30");
  expect(formatted(at(3, 19, 40))).toBe("3 nov, 19:40");
  expect(formatted(Date.UTC(2025, 10, 3, 19, 40))).toBe("3 nov 2025, 19:40");
});
it("keeps yesterday correct across month/year boundaries", () => {
  const jan = Date.UTC(2026, 0, 1, 0, 1);
  const dec = Date.UTC(2025, 11, 31, 23, 59);
  expect(group(dec, jan)).toBe("yesterday");
  expect(formatted(dec, jan)).toBe("31 dic 2025, 23:59");
  expect(group(Date.UTC(2026, 9, 31), Date.UTC(2026, 10, 1))).toBe("yesterday");
});
it.each([
  ["spring", "2026-03-28T23:30:00Z", "2026-03-29T22:30:00Z", 23],
  ["autumn", "2026-10-24T22:30:00Z", "2026-10-25T23:30:00Z", 25],
] as const)(
  "uses Madrid calendar days through %s DST",
  (_, from, to, hours) => {
    // The two instants are 00:30 on consecutive civil days in Europe/Madrid.
    const previous = Date.parse(from);
    const current = Date.parse(to);
    expect((current - previous) / 3_600_000).toBe(hours);
    expect(recordingDate(previous, current, "Europe/Madrid")).toBe("00:30");
    expect(recordingDate(current, current, "Europe/Madrid")).toBe("00:30");
    expect(recordingGroup(previous, current, "Europe/Madrid")).toBe(
      "yesterday",
    );
    expect(nextRecordingDay(previous, "Europe/Madrid")).toBe(
      current - 30 * 60_000,
    );
  },
);
it.each(["2026-03-29", "2026-10-25"])("keeps UTC at 24 hours on %s", (day) => {
  const previous = Date.parse(`${day}T00:30:00Z`);
  const current = previous + 24 * 3_600_000;
  expect((current - previous) / 3_600_000).toBe(24);
  expect(recordingDate(previous, current, "UTC")).toBe("00:30");
  expect(recordingGroup(previous, current, "UTC")).toBe("yesterday");
  expect(nextRecordingDay(previous, "UTC")).toBe(current - 30 * 60_000);
});
it("uses the injected zone for grouping, time and year boundaries", () => {
  const previous = Date.parse("2026-11-16T23:30:00Z");
  const current = Date.parse("2026-11-17T00:30:00Z");
  expect(recordingGroup(previous, current, "UTC")).toBe("yesterday");
  expect(recordingGroup(previous, current, "Europe/Madrid")).toBe("today");
  expect(recordingDate(previous, current, "UTC")).toBe("23:30");
  expect(recordingDate(previous, current, "Europe/Madrid")).toBe("00:30");
  const dec = Date.parse("2025-12-31T23:30:00Z");
  const jan = Date.parse("2026-01-01T00:30:00Z");
  expect(recordingDate(dec, jan, "UTC")).toBe("31 dic 2025, 23:30");
  expect(recordingDate(dec, jan, "Europe/Madrid")).toBe("00:30");
});
