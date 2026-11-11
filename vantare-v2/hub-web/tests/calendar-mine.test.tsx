// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import fixture from "../fixtures/calendar-demo.json";
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
