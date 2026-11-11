import { expect, it } from "vitest";
import {
  type CalendarConfigView,
  calendarDefaultAlerts,
  calendarEmptyRevision,
} from "../src/contract/generated/calendar";
import {
  isCalendarIcsView,
  isReply,
  isRequest,
} from "../src/contract/modules/calendar";
import { mockCalendarIcs } from "../src/mock/calendar-ics";
import { calendarReference } from "../src/mock/calendar-reference";

const config = (): CalendarConfigView => ({
  utc: false,
  prefsRevision: calendarEmptyRevision,
  following: [],
  followingRevision: calendarEmptyRevision,
  alerts: {
    ...calendarDefaultAlerts,
    bands: [],
    slots: [],
    channels: { ...calendarDefaultAlerts.channels },
  },
  alertsRevision: calendarEmptyRevision,
  documents: { prefs: "ready", following: "ready", alerts: "ready" },
});
const now = Date.parse("2026-10-08T17:47:13Z");
it("accepts only the closed ICS options and export hash, never renderer destinations", () => {
  expect(
    isRequest({ method: "calendar.icsPrepare", scope: "favs", alarm: true }),
  ).toBe(true);
  expect(
    isRequest({ method: "calendar.icsPrepare", scope: "other", alarm: true }),
  ).toBe(false);
  expect(
    isRequest({
      method: "calendar.icsPrepare",
      scope: "all",
      alarm: false,
      path: "C:/file.ics",
    }),
  ).toBe(false);
  expect(
    isRequest({ method: "calendar.icsExport", preparedHash: "a".repeat(64) }),
  ).toBe(true);
  for (const preparedHash of ["", "a".repeat(63), "A".repeat(64)])
    expect(isRequest({ method: "calendar.icsExport", preparedHash })).toBe(
      false,
    );
  expect(
    isReply({ method: "calendar.icsExport", status: "saved", path: "private" }),
  ).toBe(false);
  expect(isReply({ method: "calendar.icsExport", status: "unknown" })).toBe(
    false,
  );
});
it("mock prepares real published events with the same bounded preview and alarm shape", () => {
  const value = mockCalendarIcs(
    calendarReference(),
    config(),
    "events",
    true,
    now,
  );
  if (typeof value === "string") throw new Error(value);
  expect(isCalendarIcsView(value)).toBe(true);
  expect(value.total).toBeGreaterThan(0);
  expect(value.calendar).toContain("BEGIN:VALARM\r\n");
  expect(value.calendar).toContain("TRIGGER:-PT10M");
  expect(value.calendar.match(/BEGIN:VEVENT/gu)?.length).toBe(value.total);
  expect(value.entries).toHaveLength(Math.min(4, value.total));
  expect(isCalendarIcsView({ ...value, preparedHash: "invalid" })).toBe(false);
  expect(isCalendarIcsView({ ...value, total: 0 })).toBe(false);
  const favs = mockCalendarIcs(
    calendarReference(),
    config(),
    "favs",
    false,
    now,
  );
  expect(typeof favs !== "string" && favs.total).toBe(0);
});
it("keeps unrelated protected documents isolated in the mock", () => {
  const prefs = config();
  prefs.documents.alerts = "protected";
  prefs.documents.following = "protected";
  expect(
    typeof mockCalendarIcs(calendarReference(), prefs, "events", false, now),
  ).toBe("object");
  expect(mockCalendarIcs(calendarReference(), prefs, "favs", false, now)).toBe(
    "protected",
  );
  expect(mockCalendarIcs(calendarReference(), prefs, "events", true, now)).toBe(
    "protected",
  );
});
