// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { calendarReference } from "../src/mock/calendar-reference";
import { calendarText as text } from "../src/renderer/i18n/calendar";
import { CalendarFilters } from "../src/renderer/ui/CalendarFilters";
import { CalendarLiveView } from "../src/renderer/ui/CalendarLiveView";

afterEach(cleanup);
it("keeps the favorite star and tier markers while routing both filters", () => {
  const only = vi.fn(),
    tier = vi.fn();
  render(
    <CalendarFilters
      only="all"
      tier="all"
      total={11}
      following={3}
      onOnly={only}
      onTier={tier}
    />,
  );
  const favorite = screen.getByRole("button", { name: `${text.favorites} 3` });
  expect(favorite.querySelector("svg")).not.toBeNull();
  fireEvent.click(favorite);
  expect(only).toHaveBeenCalledWith("favorites");
  for (const [value, label] of Object.entries(text.tiers)) {
    const button = screen.getByRole("button", { name: label });
    expect(button.querySelector(`i[data-tier="${value}"]`)).not.toBeNull();
    fireEvent.click(button);
    expect(tier).toHaveBeenLastCalledWith(value);
  }
});
it("shows the complete time-zone caption and the next departure instead of the circuit in the event range", () => {
  const view = calendarReference();
  if (!view.official) throw new Error("Missing public schedule");
  const event = view.official.series.find(
    (series) => series.id === "weekly-10-hours-of-road-atlanta",
  );
  if (!event) throw new Error("Missing public event");
  event.recurrence = {
    kind: "weekly",
    intervalMinutes: 0,
    days: ["Fri"],
    timesUTC: ["04:00"],
  };
  render(
    <CalendarLiveView
      schedule={view.official}
      alerts={{
        leadMin: 10,
        bands: [],
        slots: [],
        channels: { windows: true, inTrack: true, sound: false },
        autoLaunch: false,
        notifyWeek: true,
      }}
      following={view.following}
      utc
      now={Date.parse("2026-10-08T17:47:13Z")}
      limit={10000}
      onFollow={() => {}}
      onLaunch={() => {}}
    />,
  );
  expect(
    screen.getByText(`${text.slotsNext90}${text.separator}${text.utc}`),
  ).toBeTruthy();
  expect(
    screen.getByRole("button", {
      name: `${text.tomorrow} 04:00${text.separator}${text.weekendSlots}`,
    }),
  ).toBeTruthy();
  expect(
    screen.queryByText("Road Atlanta · · tandas de fin de semana"),
  ).toBeNull();
});
