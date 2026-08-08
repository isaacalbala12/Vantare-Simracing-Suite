import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Calendar, RaceEvent } from "../../calendar/calendar-types";
import { CalendarTimelineView } from "./CalendarTimelineView";

const now = new Date("2026-08-04T12:00:00Z");

function event(id: string, startTime: string, seriesId: string): RaceEvent {
  return {
    id,
    title: "Race",
    sim: "lmu",
    track: "Bahrain (Outer)",
    series: seriesId,
    sessionLabel: "",
    startTime,
    durationMin: 20,
    registrationUrl: "",
    source: "bundled",
    notes: "",
  };
}

function calendarWith(events: RaceEvent[]): Calendar {
  return {
    version: 1,
    timezone: "UTC",
    reminderMinutes: [],
    events,
    updated: "",
    series: [
      {
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
      },
    ],
    seriesPreviews: [],
  };
}

afterEach(cleanup);

describe("CalendarTimelineView", () => {
  it("draws a row per series and a block per race", () => {
    const calendar = calendarWith([
      event("e1", "2026-08-04T12:15:00Z", "beginner-lmgt3-fixed"),
      event("e2", "2026-08-04T13:00:00Z", "beginner-lmgt3-fixed"),
    ]);
    render(<CalendarTimelineView calendar={calendar} timeZone="UTC" now={now} hours={4} />);

    expect(screen.getByTestId("calendar-timeline-row-beginner-lmgt3-fixed")).toBeTruthy();
    expect(screen.getByTestId("calendar-timeline-block-e1")).toBeTruthy();
    expect(screen.getByTestId("calendar-timeline-block-e2")).toBeTruthy();
  });

  it("positions blocks by their place in the window", () => {
    const calendar = calendarWith([event("e2", "2026-08-04T13:00:00Z", "beginner-lmgt3-fixed")]);
    render(<CalendarTimelineView calendar={calendar} timeZone="UTC" now={now} hours={4} />);

    // One hour into a four hour window.
    expect(screen.getByTestId("calendar-timeline-block-e2").style.left).toBe("25%");
  });

  it("marks where now falls so the row reads against the clock", () => {
    const calendar = calendarWith([]);
    // 12:30 inside a window that starts at 12:00 and spans 4 hours.
    render(
      <CalendarTimelineView
        calendar={calendar}
        timeZone="UTC"
        now={new Date("2026-08-04T12:30:00Z")}
        hours={4}
      />,
    );

    const marker = screen.getByTestId("calendar-timeline-now-beginner-lmgt3-fixed");
    expect(marker.style.left).toBe("12.5%");
  });

  it("keeps a series with nothing scheduled visible as an empty row", () => {
    render(<CalendarTimelineView calendar={calendarWith([])} timeZone="UTC" now={now} hours={4} />);

    expect(screen.getByTestId("calendar-timeline-row-beginner-lmgt3-fixed")).toBeTruthy();
    expect(screen.queryByTestId(/^calendar-timeline-block-/)).toBeNull();
  });

  it("reports which series was clicked", () => {
    const onSeriesClick = vi.fn();
    render(
      <CalendarTimelineView
        calendar={calendarWith([])}
        timeZone="UTC"
        now={now}
        hours={4}
        onSeriesClick={onSeriesClick}
      />,
    );

    fireEvent.click(screen.getByText("LMGT3 Fixed"));
    expect(onSeriesClick).toHaveBeenCalledWith("beginner-lmgt3-fixed");
  });

  it("explains itself when there are no series at all", () => {
    const calendar = { ...calendarWith([]), series: [] };
    render(<CalendarTimelineView calendar={calendar} timeZone="UTC" now={now} hours={4} />);

    expect(screen.getByTestId("calendar-timeline-empty")).toBeTruthy();
  });
});
