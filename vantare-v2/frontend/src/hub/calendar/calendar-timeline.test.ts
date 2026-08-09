import { describe, expect, it } from "vitest";
import type { Calendar, RaceEvent, RaceSeries } from "../../calendar/calendar-types";
import {
  buildTimelineRows,
  buildTimelineTicks,
  buildTimelineWindow,
  nowMarkerPct,
} from "./calendar-timeline";

function series(overrides: Partial<RaceSeries> = {}): RaceSeries {
  return {
    id: "beginner-lmgt3-fixed",
    name: "LMGT3 Fixed",
    tier: "beginner",
    licenseLabel: "Bronze SR",
    track: "Bahrain (Outer)",
    vehicleClass: "LMGT3 Class",
    setup: "fixed",
    durationMin: 20,
    splits: 20,
    assists: "High assists allowed",
    tyreWarmers: true,
    tyres: 8,
    recurrence: { kind: "interval", intervalMinutes: 15 },
    ...overrides,
  };
}

function event(id: string, startTime: string, seriesId: string, durationMin = 20): RaceEvent {
  return {
    id,
    title: "Race",
    sim: "lmu",
    track: "Bahrain (Outer)",
    series: seriesId,
    sessionLabel: "",
    startTime,
    durationMin,
    registrationUrl: "",
    source: "bundled",
    notes: "",
  };
}

function calendarWith(events: RaceEvent[], seriesList: RaceSeries[] = [series()]): Calendar {
  return {
    version: 1,
    timezone: "UTC",
    reminderMinutes: [],
    events,
    updated: "",
    series: seriesList,
    seriesPreviews: seriesList.map((s) => ({
      seriesId: s.id,
      scheduleLabel: "cada 15min",
      nextStarts: [],
    })),
  };
}

describe("buildTimelineWindow", () => {
  it("anchors to the top of the hour so columns line up with their labels", () => {
    const window = buildTimelineWindow(new Date("2026-08-04T12:37:41Z"), 6, "UTC");
    expect(new Date(window.fromMs).toISOString()).toBe("2026-08-04T12:00:00.000Z");
    expect(window.toMs - window.fromMs).toBe(6 * 3_600_000);
  });

  it("anchors on the display zone's hour, not the browser's", () => {
    // Kolkata runs at +05:30, so its hour starts at :30 past the UTC hour. The
    // labels are written in that zone, so the grid has to agree with them.
    const window = buildTimelineWindow(new Date("2026-08-04T12:37:41Z"), 6, "Asia/Kolkata");
    expect(new Date(window.fromMs).toISOString()).toBe("2026-08-04T12:30:00.000Z");
  });

  it("leaves whole-hour zones where they already were", () => {
    const window = buildTimelineWindow(new Date("2026-08-04T12:37:41Z"), 6, "Europe/Madrid");
    expect(new Date(window.fromMs).toISOString()).toBe("2026-08-04T12:00:00.000Z");
  });
});

describe("buildTimelineTicks", () => {
  it("emits one tick per hour, positioned across the window", () => {
    const window = buildTimelineWindow(new Date("2026-08-04T12:00:00Z"), 4, "UTC");
    const ticks = buildTimelineTicks(window);
    expect(ticks).toHaveLength(4);
    expect(ticks[0].leftPct).toBe(0);
    expect(ticks[1].leftPct).toBe(25);
    expect(ticks[3].leftPct).toBe(75);
  });
});

describe("nowMarkerPct", () => {
  const window = buildTimelineWindow(new Date("2026-08-04T12:00:00Z"), 4, "UTC");

  it("places the marker proportionally inside the window", () => {
    expect(nowMarkerPct(window, new Date("2026-08-04T13:00:00Z"))).toBe(25);
  });

  it("returns null once the window no longer contains now", () => {
    expect(nowMarkerPct(window, new Date("2026-08-04T20:00:00Z"))).toBeNull();
    expect(nowMarkerPct(window, new Date("2026-08-04T09:00:00Z"))).toBeNull();
  });
});

describe("buildTimelineRows", () => {
  const window = buildTimelineWindow(new Date("2026-08-04T12:00:00Z"), 4, "UTC");

  it("lays out one row per series with its blocks in time order", () => {
    const calendar = calendarWith([
      event("e2", "2026-08-04T13:00:00Z", "beginner-lmgt3-fixed"),
      event("e1", "2026-08-04T12:15:00Z", "beginner-lmgt3-fixed"),
    ]);
    const rows = buildTimelineRows(calendar, window);

    expect(rows).toHaveLength(1);
    expect(rows[0].blocks.map((b) => b.id)).toEqual(["e1", "e2"]);
    expect(rows[0].blocks[1].leftPct).toBe(25);
  });

  it("keeps a series with no races as an empty row instead of hiding it", () => {
    const rows = buildTimelineRows(calendarWith([]), window);
    expect(rows).toHaveLength(1);
    expect(rows[0].blocks).toHaveLength(0);
  });

  it("keeps rows in schedule order rather than sorting them", () => {
    const calendar = calendarWith(
      [],
      [
        series({ id: "beginner-a", tier: "beginner", name: "A" }),
        series({ id: "advanced-b", tier: "advanced", name: "B" }),
        series({ id: "weekly-c", tier: "weekly", name: "C" }),
      ],
    );
    const rows = buildTimelineRows(calendar, window);
    expect(rows.map((r) => r.seriesId)).toEqual(["beginner-a", "advanced-b", "weekly-c"]);
  });

  it("includes a race already running when the window opens, clipped to it", () => {
    // Starts 10 minutes before the window and runs 20, so half of it is inside.
    const calendar = calendarWith([
      event("running", "2026-08-04T11:50:00Z", "beginner-lmgt3-fixed"),
    ]);
    const rows = buildTimelineRows(calendar, window);

    expect(rows[0].blocks).toHaveLength(1);
    const block = rows[0].blocks[0];
    expect(block.leftPct).toBe(0);
    // 10 minutes of a 4 hour window.
    expect(block.widthPct).toBeCloseTo((10 / 240) * 100, 5);
    // The real start is preserved even though the drawing is clipped.
    expect(new Date(block.startMs).toISOString()).toBe("2026-08-04T11:50:00.000Z");
  });

  it("drops races that fall entirely outside the window", () => {
    const calendar = calendarWith([
      event("before", "2026-08-04T09:00:00Z", "beginner-lmgt3-fixed"),
      event("after", "2026-08-04T20:00:00Z", "beginner-lmgt3-fixed"),
    ]);
    const rows = buildTimelineRows(calendar, window);
    expect(rows[0].blocks).toHaveLength(0);
  });

  it("ignores events whose series is not in the calendar", () => {
    const calendar = calendarWith([
      event("orphan", "2026-08-04T12:30:00Z", "series-that-went-away"),
    ]);
    const rows = buildTimelineRows(calendar, window);
    expect(rows[0].blocks).toHaveLength(0);
  });
});
