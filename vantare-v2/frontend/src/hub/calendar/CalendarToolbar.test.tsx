import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { describe, expect, it, vi, afterEach } from "vitest";
import { CalendarToolbar } from "./CalendarToolbar";

describe("CalendarToolbar", () => {
  const defaultProps = {
    view: "month" as const,
    anchorDate: new Date(2026, 6, 1, 12, 0), // Local July 1 noon, avoids UTC ambiguity
    activeFilter: "all" as const,
    onViewChange: vi.fn(),
    onToday: vi.fn(),
    onPrevious: vi.fn(),
    onNext: vi.fn(),
    onFilterChange: vi.fn(),
  };

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders buttons for Próximas, Timeline and Mes", () => {
    render(<CalendarToolbar {...defaultProps} />);
    expect(screen.getByTestId("calendar-view-upcoming")).toBeTruthy();
    expect(screen.getByTestId("calendar-view-timeline")).toBeTruthy();
    expect(screen.getByTestId("calendar-view-month")).toBeTruthy();
  });

  it("titles the timeline by what it shows", () => {
    render(<CalendarToolbar {...defaultProps} view="timeline" />);
    expect(screen.getByTestId("calendar-toolbar-title").textContent).toBe("Parrilla del día");
  });

  it("no longer offers the retired week and day views", () => {
    render(<CalendarToolbar {...defaultProps} />);
    expect(screen.queryByTestId("calendar-view-week")).toBeNull();
    expect(screen.queryByTestId("calendar-view-day")).toBeNull();
  });

  it("sets aria-pressed='true' on the active view button", () => {
    render(<CalendarToolbar {...defaultProps} view="upcoming" />);
    const upcomingBtn = screen.getByTestId("calendar-view-upcoming");
    expect(upcomingBtn.getAttribute("aria-pressed")).toBe("true");
    const monthBtn = screen.getByTestId("calendar-view-month");
    expect(monthBtn.getAttribute("aria-pressed")).toBe("false");
  });

  it("calls onViewChange when a view button is clicked", () => {
    const onViewChange = vi.fn();
    render(<CalendarToolbar {...defaultProps} onViewChange={onViewChange} />);

    fireEvent.click(screen.getByTestId("calendar-view-upcoming"));
    expect(onViewChange).toHaveBeenCalledWith("upcoming");

    fireEvent.click(screen.getByTestId("calendar-view-month"));
    expect(onViewChange).toHaveBeenCalledWith("month");
  });

  it("calls navigation callbacks when nav buttons are clicked", () => {
    const onPrevious = vi.fn();
    const onToday = vi.fn();
    const onNext = vi.fn();
    render(
      <CalendarToolbar
        {...defaultProps}
        onPrevious={onPrevious}
        onToday={onToday}
        onNext={onNext}
      />
    );

    fireEvent.click(screen.getByTestId("calendar-nav-prev"));
    expect(onPrevious).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId("calendar-nav-today"));
    expect(onToday).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId("calendar-nav-next"));
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it("formats month view title correctly", () => {
    render(<CalendarToolbar {...defaultProps} view="month" />);
    expect(screen.getByTestId("calendar-toolbar-title").textContent).toBe("Julio 2026");
  });

  it("titles the upcoming view by what it shows, not by a date range", () => {
    render(<CalendarToolbar {...defaultProps} view="upcoming" />);
    expect(screen.getByTestId("calendar-toolbar-title").textContent).toBe("Próximas salidas");
  });

  it("renders the view switcher as role='group' with name 'Vista de calendario'", () => {
    render(<CalendarToolbar {...defaultProps} />);
    const groupElement = screen.getByRole("group", { name: "Vista de calendario" });
    expect(groupElement).toBeTruthy();
  });

  it("opens filter menu and selects a tier filter", () => {
    const onFilterChange = vi.fn();
    render(<CalendarToolbar {...defaultProps} onFilterChange={onFilterChange} />);

    fireEvent.click(screen.getByTestId("calendar-filter-toggle"));
    expect(screen.getByTestId("calendar-filter-menu")).toBeTruthy();

    fireEvent.click(screen.getByTestId("calendar-filter-beginner"));
    expect(onFilterChange).toHaveBeenCalledWith("beginner");
  });

  it("opens filter menu and selects all filter", () => {
    const onFilterChange = vi.fn();
    render(<CalendarToolbar {...defaultProps} activeFilter="beginner" onFilterChange={onFilterChange} />);

    fireEvent.click(screen.getByTestId("calendar-filter-toggle"));
    fireEvent.click(screen.getByTestId("calendar-filter-all"));
    expect(onFilterChange).toHaveBeenCalledWith("all");
  });

  it("calls onRefresh when the refresh button is clicked", () => {
    const onRefresh = vi.fn();
    render(<CalendarToolbar {...defaultProps} onRefresh={onRefresh} />);

    fireEvent.click(screen.getByTestId("calendar-refresh"));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });
});
