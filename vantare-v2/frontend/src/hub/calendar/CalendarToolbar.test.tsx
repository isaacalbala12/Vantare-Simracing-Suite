import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { describe, expect, it, vi, afterEach } from "vitest";
import { CalendarToolbar } from "./CalendarToolbar";

describe("CalendarToolbar", () => {
  const defaultProps = {
    view: "month" as const,
    anchorDate: new Date("2026-07-01T12:00:00Z"),
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

  it("renders buttons for Mes, Semana, Día", () => {
    render(<CalendarToolbar {...defaultProps} />);
    expect(screen.getByTestId("calendar-view-btn-month")).toBeTruthy();
    expect(screen.getByTestId("calendar-view-btn-week")).toBeTruthy();
    expect(screen.getByTestId("calendar-view-btn-day")).toBeTruthy();
  });

  it("sets aria-pressed='true' on the active view button", () => {
    const { rerender } = render(<CalendarToolbar {...defaultProps} view="month" />);
    expect(screen.getByTestId("calendar-view-btn-month").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("calendar-view-btn-week").getAttribute("aria-pressed")).toBe("false");

    rerender(<CalendarToolbar {...defaultProps} view="week" />);
    expect(screen.getByTestId("calendar-view-btn-month").getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByTestId("calendar-view-btn-week").getAttribute("aria-pressed")).toBe("true");
  });

  it("calls onViewChange when a view button is clicked", () => {
    const onViewChange = vi.fn();
    render(<CalendarToolbar {...defaultProps} onViewChange={onViewChange} />);

    fireEvent.click(screen.getByTestId("calendar-view-btn-week"));
    expect(onViewChange).toHaveBeenCalledWith("week");

    fireEvent.click(screen.getByTestId("calendar-view-btn-day"));
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
    expect(onPrevious).toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("calendar-nav-today"));
    expect(onToday).toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("calendar-nav-next"));
    expect(onNext).toHaveBeenCalled();
  });

  it("formats month view title correctly", () => {
    render(<CalendarToolbar {...defaultProps} view="month" />);
    expect(screen.getByTestId("calendar-toolbar-title").textContent).toBe("Julio 2026");
  });

  it("formats week view title correctly", () => {
    render(<CalendarToolbar {...defaultProps} view="week" />);
    // June 29, 2026 is Monday for that week.
    expect(screen.getByTestId("calendar-toolbar-title").textContent).toBe("Semana del 29 Jun");
  });

  it("formats day view title correctly", () => {
    render(<CalendarToolbar {...defaultProps} view="day" />);
    // July 1, 2026 is Wednesday ("Miércoles").
    expect(screen.getByTestId("calendar-toolbar-title").textContent).toBe("Miércoles 1 Jul");
  });

  it("renders the view switcher as role='group' with name 'Vista de calendario'", () => {
    render(<CalendarToolbar {...defaultProps} />);
    const groupElement = screen.getByRole("group", { name: "Vista de calendario" });
    expect(groupElement).toBeTruthy();
  });
});
