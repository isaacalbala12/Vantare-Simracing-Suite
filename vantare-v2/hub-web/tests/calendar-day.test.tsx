// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import fixture from "../fixtures/calendar-demo.json";
import { calendarDayText as text } from "../src/renderer/i18n/calendarDay";
import { CalendarDayView } from "../src/renderer/ui/CalendarDayView";

afterEach(cleanup);
const alerts = {
  leadMin: 10,
  bands: [],
  slots: [],
  channels: { windows: true, inTrack: true, sound: false },
  autoLaunch: false,
  notifyWeek: true,
};
it("preserves a manually scrolled position across clock ticks and routes view changes", () => {
  const span = vi.fn(),
    full = vi.fn();
  const props = {
    schedule: fixture,
    alerts,
    following: [],
    now: Date.parse("2026-07-02T12:00:00Z"),
    utc: true,
    limit: 1000,
    onSpan: span,
    onFull: full,
    onDetail: () => {},
  };
  const { container, rerender } = render(<CalendarDayView {...props} />);
  const scroller = container.querySelector(
    ".v-calendar-day-scroll",
  ) as HTMLDivElement;
  expect(scroller.scrollTop).toBe(180);
  scroller.scrollTop = 42;
  rerender(<CalendarDayView {...props} now={props.now + 1000} />);
  expect(scroller.scrollTop).toBe(42);
  fireEvent.click(screen.getByRole("button", { name: text.week }));
  expect(span).toHaveBeenCalledWith("week");
  fireEvent.click(screen.getByRole("button", { name: text.full }));
  expect(full).toHaveBeenCalledOnce();
});
it("shows the empty favorites state without replacing the date controls", () => {
  render(
    <CalendarDayView
      schedule={fixture}
      alerts={alerts}
      following={[]}
      now={Date.parse("2026-07-02T12:00:00Z")}
      utc
      limit={1000}
      onSpan={() => {}}
      onFull={() => {}}
      onDetail={() => {}}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: text.favorites }));
  expect(screen.getByRole("heading", { name: text.emptyTitle })).toBeTruthy();
  expect(
    screen.getByRole("button", { name: new RegExp(`${text.today}\\s*2`) }),
  ).toBeTruthy();
});
