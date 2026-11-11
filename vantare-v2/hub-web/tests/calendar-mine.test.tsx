// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import fixture from "../fixtures/calendar-demo.json";
import { calendarReference } from "../src/mock/calendar-reference";
import { calendarRuns } from "../src/mock/calendar-runs";
import { calendarMineText as text } from "../src/renderer/i18n/calendarMine";
import { CalendarMineView } from "../src/renderer/ui/CalendarMineView";

afterEach(cleanup);
const alerts = {
  leadMin: 10,
  bands: [],
  slots: [],
  channels: { windows: true, inTrack: true, sound: false },
  autoLaunch: false,
  notifyWeek: true,
};
it("offers navigation instead of inventing a next race without favorites", () => {
  const series = vi.fn(),
    upcoming = vi.fn();
  render(
    <CalendarMineView
      schedule={fixture}
      alerts={alerts}
      following={[]}
      now={Date.parse(fixture.validFrom)}
      utc
      limit={1000}
      onUpcoming={upcoming}
      onSeries={series}
      onExport={() => {}}
      onLaunch={() => {}}
      onDetail={() => {}}
      onAlert={() => {}}
    />,
  );
  expect(screen.getByRole("heading", { name: text.emptyTitle })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: text.seeSeries }));
  expect(series).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("button", { name: text.seeUpcoming }));
  expect(upcoming).toHaveBeenCalledOnce();
});
it("filters out favorite departures without alerts and forwards export and launch", () => {
  const launch = vi.fn(),
    exportFile = vi.fn();
  const schedule = {
    ...fixture,
    validUntil: new Date(
      Date.parse(fixture.validFrom) + 86400000,
    ).toISOString(),
    series: [fixture.series[0]],
  };
  render(
    <CalendarMineView
      schedule={schedule}
      alerts={alerts}
      following={[fixture.series[0].id]}
      now={Date.parse(fixture.validFrom)}
      utc
      limit={1000}
      onUpcoming={() => {}}
      onSeries={() => {}}
      onExport={exportFile}
      onLaunch={launch}
      onDetail={() => {}}
      onAlert={() => {}}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: text.launch }));
  expect(launch).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("button", { name: text.export }));
  expect(exportFile).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("button", { name: text.alerted }));
  expect(screen.getByText(text.noDepartures)).toBeTruthy();
  expect(screen.queryByRole("button", { name: text.launch })).toBeNull();
});

it("counts only runs in the published week and hides completed rows in the alert filter", () => {
  const value = calendarReference();
  if (!value.official) throw new Error("Missing reference publication");
  const before = JSON.stringify(calendarRuns);
  render(
    <CalendarMineView
      schedule={value.official}
      alerts={alerts}
      following={value.following}
      now={Date.parse("2026-10-08T17:47:13Z")}
      utc
      limit={1000}
      runs={calendarRuns}
      onUpcoming={() => {}}
      onSeries={() => {}}
      onLaunch={() => {}}
    />,
  );
  expect(screen.getByText(text.races(4))).toBeTruthy();
  expect(screen.getByText(text.best("2:01.384", "Sebring"))).toBeTruthy();
  expect(screen.getByText(text.runSummary(4, 6, "2:01.384"))).toBeTruthy();
  expect(screen.getByRole("heading", { name: text.alreadyRan })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: text.alerted }));
  expect(screen.queryByRole("heading", { name: text.alreadyRan })).toBeNull();
  expect(screen.getByText(text.races(4))).toBeTruthy();
  expect(JSON.stringify(calendarRuns)).toBe(before);
});
it("cannot launch when the host snapshot disallows it", () => {
  const launch = vi.fn();
  render(
    <CalendarMineView
      schedule={fixture}
      alerts={alerts}
      following={[fixture.series[0].id]}
      now={Date.parse(fixture.validFrom)}
      utc
      limit={1000}
      canLaunch={false}
      onUpcoming={() => {}}
      onSeries={() => {}}
      onLaunch={launch}
    />,
  );
  const button = screen.getByRole("button", { name: text.launch });
  expect((button as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(button);
  expect(launch).not.toHaveBeenCalled();
});
