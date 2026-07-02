import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CalendarSeriesCard } from "./CalendarSeriesCard";

afterEach(() => {
  cleanup();
});

const BASE_SERIES = {
  id: "lmu-fixed",
  name: "LMU Fixed",
  tier: "beginner",
  licenseLabel: "Rookie",
  track: "Silverstone",
  vehicleClass: "GT3",
  setup: "Fixed",
  durationMin: 20,
  splits: 4,
  assists: "Auto",
  tyreWarmers: false,
  tyres: 4,
  recurrence: { kind: "interval" as const, intervalMinutes: 30 },
};

describe("CalendarSeriesCard", () => {
  it("renders scheduleLabel as badge", () => {
    render(
      <CalendarSeriesCard
        series={BASE_SERIES}
        preview={{ seriesId: "lmu-fixed", scheduleLabel: "Cada 30 min", nextStarts: [] }}
      />
    );
    expect(screen.getByTestId("series-lmu-fixed-schedule")).toBeTruthy();
    expect(screen.getByText("Cada 30 min")).toBeTruthy();
  });

  it("renders nextStarts as chips", () => {
    render(
      <CalendarSeriesCard
        series={BASE_SERIES}
        preview={{
          seriesId: "lmu-fixed",
          scheduleLabel: "Cada 30 min",
          nextStarts: ["2026-07-02T20:00:00Z", "2026-07-02T20:30:00Z"],
        }}
      />
    );
    const container = screen.getByTestId("series-lmu-fixed-nextstarts");
    expect(container.children.length).toBe(2);
    expect(screen.getByText("2026-07-02T20:00:00Z")).toBeTruthy();
    expect(screen.getByText("2026-07-02T20:30:00Z")).toBeTruthy();
  });

  it("renders Horario pendiente when no preview", () => {
    render(<CalendarSeriesCard series={BASE_SERIES} />);
    expect(screen.getByTestId("series-lmu-fixed-schedule-pending")).toBeTruthy();
    expect(screen.getByText("Horario pendiente")).toBeTruthy();
  });

  it("renders key metadata", () => {
    render(<CalendarSeriesCard series={BASE_SERIES} />);
    // Use getAllBy since screen persists across all test cases in the file
    expect(screen.getAllByTestId("series-lmu-fixed-class").length).toBe(1);
    expect(screen.getByText("GT3")).toBeTruthy();
    expect(screen.getAllByTestId("series-lmu-fixed-setup").length).toBe(1);
    expect(screen.getByText("Fixed")).toBeTruthy();
    expect(screen.getAllByTestId("series-lmu-fixed-duration").length).toBe(1);
    expect(screen.getByText("20 min")).toBeTruthy();
    expect(screen.getAllByTestId("series-lmu-fixed-splits").length).toBe(1);
    expect(screen.getByText("4 splits")).toBeTruthy();
    expect(screen.getAllByTestId("series-lmu-fixed-assists").length).toBe(1);
    expect(screen.getByText("Auto")).toBeTruthy();
  });

  it("renders tyre warmers when present", () => {
    const withWarmers = { ...BASE_SERIES, tyreWarmers: true };
    render(<CalendarSeriesCard series={withWarmers} />);
    expect(screen.getByTestId("series-lmu-fixed-tyrewarmers")).toBeTruthy();
    expect(screen.getByText("Tyre warmers")).toBeTruthy();
  });

  it("does not render SR/DR/rating/precios/votos", () => {
    render(<CalendarSeriesCard series={BASE_SERIES} />);
    expect(screen.queryByText(/€/)).toBeNull();
    expect(screen.queryByText(/votos/i)).toBeNull();
    expect(screen.queryByText(/rating/i)).toBeNull();
    expect(screen.queryByText(/SR/i)).toBeNull();
    expect(screen.queryByText(/DR/i)).toBeNull();
  });
});
