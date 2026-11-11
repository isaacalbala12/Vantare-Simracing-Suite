import { expect, it } from "vitest";
import { bandSegments, weekDates } from "../src/renderer/screens/calendar/grid";

it("paints a local band on every displayed date without applying notification day filters", () => {
  const dates = weekDates(Date.parse("2026-10-20T00:00:00Z"), true);
  const spans = bandSegments(
    dates,
    { seriesId: "series", from: 120, to: 180, days: "weekdays", mode: "first" },
    true,
  );
  expect(spans).toHaveLength(7);
  for (const span of spans) {
    expect(new Date(span.from).getHours()).toBe(2);
    expect(span.until - span.from).toBe(60 * 60_000);
    expect(span.from).toBeGreaterThanOrEqual(dates[0]);
  }
  expect(spans.some((span) => new Date(span.from).getDay() === 0)).toBe(true);
});
