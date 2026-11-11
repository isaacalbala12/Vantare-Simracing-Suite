// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import fixture from "../fixtures/calendar-demo.json";
import { calendarText as text } from "../src/renderer/i18n/calendar";
import { CalendarUpcomingView } from "../src/renderer/ui/CalendarUpcomingView";

afterEach(cleanup);
it("offers a retry when there is no cached publication", () => {
  const refresh = vi.fn();
  render(
    <CalendarUpcomingView
      previous={null}
      utc={true}
      following={0}
      limit={1000}
      notifyWeek={true}
      onNotifyWeek={() => {}}
      onRefresh={refresh}
      busy={false}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: text.retry }));
  expect(refresh).toHaveBeenCalledOnce();
  expect(screen.queryByText(fixture.series[0].name)).toBeNull();
});
it("keeps expired rows read-only and exposes refresh and next-week preference", () => {
  const refresh = vi.fn(),
    notify = vi.fn();
  render(
    <CalendarUpcomingView
      previous={fixture}
      utc={true}
      following={0}
      limit={1000}
      notifyWeek={true}
      onNotifyWeek={notify}
      onRefresh={refresh}
      busy={false}
    />,
  );
  expect(screen.getByText(text.readonly)).toBeTruthy();
  for (const series of fixture.series)
    expect(screen.getByText(series.name)).toBeTruthy();
  expect(screen.queryByRole("button", { name: text.favorite })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: text.searchNow }));
  expect(refresh).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("switch", { name: text.notifyWeek }));
  expect(notify).toHaveBeenCalledOnce();
});
