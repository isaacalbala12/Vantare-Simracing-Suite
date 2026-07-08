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
    timeZone: "UTC",
  };

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders buttons for Mes, Semana, Día", () => {
    render(<CalendarToolbar {...defaultProps} />);
    expect(screen.getByTestId("calendar-view-month")).toBeTruthy();
    expect(screen.getByTestId("calendar-view-week")).toBeTruthy();
    expect(screen.getByTestId("calendar-view-day")).toBeTruthy();
  });

  it("sets aria-pressed='true' on the active view button", () => {
    render(<CalendarToolbar {...defaultProps} view="week" />);
    const weekBtn = screen.getByTestId("calendar-view-week");
    expect(weekBtn.getAttribute("aria-pressed")).toBe("true");
    const monthBtn = screen.getByTestId("calendar-view-month");
    expect(monthBtn.getAttribute("aria-pressed")).toBe("false");
  });

  it("calls onViewChange when a view button is clicked", () => {
    const onViewChange = vi.fn();
    render(<CalendarToolbar {...defaultProps} onViewChange={onViewChange} />);

    fireEvent.click(screen.getByTestId("calendar-view-week"));
    expect(onViewChange).toHaveBeenCalledWith("week");

    fireEvent.click(screen.getByTestId("calendar-view-day"));
    expect(onViewChange).toHaveBeenCalledWith("day");
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

  it("formats week view title correctly", () => {
    render(<CalendarToolbar {...defaultProps} view="week" />);
    // July 1 2026 is Wednesday; week range is Monday June 29 - Sunday July 5.
    // The exact format depends on timezone; just verify it starts with "Semana del".
    const title = screen.getByTestId("calendar-toolbar-title").textContent!;
    expect(title).toMatch(/^Semana del \d+.*\d+/);
  });

  it("formats day view title correctly", () => {
    render(<CalendarToolbar {...defaultProps} view="day" />);
    const title = screen.getByTestId("calendar-toolbar-title").textContent!;
    // July 1 2026 is Wednesday. Capitalized weekday + "1 Jul".
    expect(title).toMatch(/^.+ 1 Jul$/);
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
});
