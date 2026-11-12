import { afterEach, expect, it, vi } from "vitest";
import { createMockHost } from "../src/mock/host";

afterEach(() => vi.restoreAllMocks());
it("prepares the fixed bank scene in main even when the system date is outside October", () => {
  vi.spyOn(Date, "now").mockReturnValue(Date.parse("2027-01-01T00:00:00Z"));
  const host = createMockHost("visual-dark:calendar-live-reference");
  const result = host({
    kind: "request",
    id: 41,
    request: { method: "calendar.icsPrepare", scope: "favs", alarm: true },
  });
  if (
    result?.kind !== "response" ||
    result.result.method !== "calendar.icsPrepare"
  )
    throw new Error("visual ICS unavailable");
  expect(result.result.value.total).toBe(75);
  expect(result.result.value.entries).toHaveLength(4);
});
it("keeps the actual clock for the ordinary reference mock", () => {
  vi.spyOn(Date, "now").mockReturnValue(Date.parse("2027-01-01T00:00:00Z"));
  const host = createMockHost("calendar-live-reference");
  expect(
    host({
      kind: "request",
      id: 42,
      request: { method: "calendar.icsPrepare", scope: "favs", alarm: true },
    }),
  ).toEqual({
    kind: "failure",
    id: 42,
    error: { kind: "calendarScheduleUnavailable" },
  });
});
