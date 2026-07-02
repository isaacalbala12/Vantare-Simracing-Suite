import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
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

  it("shows Seguir serie button when not followed", () => {
    render(<CalendarSeriesCard series={BASE_SERIES} isFollowed={false} />);
    expect(screen.getByTestId("series-follow-btn-lmu-fixed")).toBeTruthy();
    expect(screen.getByText("Seguir serie")).toBeTruthy();
  });

  it("clicking Seguir serie calls onFollow with seriesId", () => {
    const onFollow = vi.fn();
    render(<CalendarSeriesCard series={BASE_SERIES} isFollowed={false} onFollow={onFollow} />);
    fireEvent.click(screen.getByTestId("series-follow-btn-lmu-fixed"));
    expect(onFollow).toHaveBeenCalledWith("lmu-fixed");
  });

  it("shows Siguiendo badge when followed", () => {
    render(<CalendarSeriesCard series={BASE_SERIES} isFollowed={true} />);
    expect(screen.getByTestId("series-following-badge-lmu-fixed")).toBeTruthy();
    expect(screen.getByText("Siguiendo")).toBeTruthy();
  });

  it("shows Dejar de seguir button when followed", () => {
    render(<CalendarSeriesCard series={BASE_SERIES} isFollowed={true} />);
    expect(screen.getByTestId("series-unfollow-btn-lmu-fixed")).toBeTruthy();
    expect(screen.getByText("Dejar de seguir")).toBeTruthy();
  });

  it("clicking Dejar de seguir calls onUnfollow with seriesId", () => {
    const onUnfollow = vi.fn();
    render(<CalendarSeriesCard series={BASE_SERIES} isFollowed={true} onUnfollow={onUnfollow} />);
    fireEvent.click(screen.getByTestId("series-unfollow-btn-lmu-fixed"));
    expect(onUnfollow).toHaveBeenCalledWith("lmu-fixed");
  });

  it("does not render follow UI when isFollowed is undefined and no handlers passed", () => {
    render(<CalendarSeriesCard series={BASE_SERIES} />);
    expect(screen.queryByTestId("series-follow-btn-lmu-fixed")).toBeNull();
    expect(screen.queryByTestId("series-following-badge-lmu-fixed")).toBeNull();
    expect(screen.queryByTestId("series-unfollow-btn-lmu-fixed")).toBeNull();
  });

  it("Seguir serie button has aria-pressed=false", () => {
    render(<CalendarSeriesCard series={BASE_SERIES} isFollowed={false} onFollow={vi.fn()} />);
    const btn = screen.getByTestId("series-follow-btn-lmu-fixed");
    expect(btn.getAttribute("aria-pressed")).toBe("false");
  });

  it("Seguir serie button has accessible name with series name", () => {
    render(<CalendarSeriesCard series={BASE_SERIES} isFollowed={false} onFollow={vi.fn()} />);
    expect(
      screen.getByRole("button", { name: "Seguir serie LMU Fixed" })
    ).toBeTruthy();
  });

  it("Dejar de seguir button has aria-pressed=true", () => {
    render(
      <CalendarSeriesCard
        series={BASE_SERIES}
        isFollowed={true}
        onUnfollow={vi.fn()}
      />
    );
    const btn = screen.getByTestId("series-unfollow-btn-lmu-fixed");
    expect(btn.getAttribute("aria-pressed")).toBe("true");
  });

  it("Dejar de seguir button has accessible name with series name", () => {
    render(
      <CalendarSeriesCard
        series={BASE_SERIES}
        isFollowed={true}
        onUnfollow={vi.fn()}
      />
    );
    expect(
      screen.getByRole("button", { name: "Dejar de seguir serie LMU Fixed" })
    ).toBeTruthy();
  });

  it("Siguiendo badge has aria-label with series name", () => {
    render(
      <CalendarSeriesCard
        series={BASE_SERIES}
        isFollowed={true}
        onUnfollow={vi.fn()}
      />
    );
    expect(
      screen.getByTestId("series-following-badge-lmu-fixed").getAttribute("aria-label")
    ).toBe("Siguiendo LMU Fixed");
  });

  it("follow/unfollow callbacks still receive series.id", () => {
    const onFollow = vi.fn();
    const onUnfollow = vi.fn();
    const { rerender } = render(
      <CalendarSeriesCard
        series={BASE_SERIES}
        isFollowed={false}
        onFollow={onFollow}
        onUnfollow={onUnfollow}
      />
    );
    fireEvent.click(screen.getByTestId("series-follow-btn-lmu-fixed"));
    expect(onFollow).toHaveBeenCalledWith("lmu-fixed");
    expect(onUnfollow).not.toHaveBeenCalled();
    rerender(
      <CalendarSeriesCard
        series={BASE_SERIES}
        isFollowed={true}
        onFollow={onFollow}
        onUnfollow={onUnfollow}
      />
    );
    fireEvent.click(screen.getByTestId("series-unfollow-btn-lmu-fixed"));
    expect(onUnfollow).toHaveBeenCalledWith("lmu-fixed");
  });
});
