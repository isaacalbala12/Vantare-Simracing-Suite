import { afterEach, expect, it, vi } from "vitest";
import { isCalendarAlerts } from "../src/contract/calendar-config-validation";
import { createMockHost } from "../src/mock/host";

afterEach(() => vi.restoreAllMocks());
it.each([true, false])(
  "uses the bank date only for visual QA (%s)",
  (visual) => {
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2027-01-01T00:00:00Z"));
    const host = createMockHost(
      `${visual ? "visual-dark:" : ""}calendar-live-reference`,
    );
    const loaded = host({
      kind: "request",
      id: 1,
      request: { method: "calendar.configLoad" },
    });
    if (
      loaded?.kind !== "response" ||
      loaded.result.method !== "calendar.configLoad"
    )
      throw new Error("config missing");
    const config = loaded.result.value;
    const alerts = structuredClone(config.alerts);
    if (!alerts.bands[0] || !config.alertsRevision)
      throw new Error("band missing");
    alerts.bands[0].from += 30;
    expect(isCalendarAlerts(alerts)).toBe(true);
    const result = host({
      kind: "request",
      id: 2,
      request: {
        method: "calendar.alertsSave",
        alerts,
        expectedRevision: config.alertsRevision,
      },
    });
    if (visual) {
      if (
        result?.kind !== "response" ||
        result.result.method !== "calendar.alertsSave"
      )
        throw new Error("visual save unavailable");
      expect(result.result.value.alerts).toEqual(alerts);
    } else
      expect(result).toEqual({
        kind: "failure",
        id: 2,
        error: { kind: "calendarScheduleUnavailable" },
      });
  },
);
