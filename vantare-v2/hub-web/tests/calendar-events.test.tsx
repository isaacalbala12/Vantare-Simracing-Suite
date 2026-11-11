// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import alerts from "../fixtures/calendar-alerts-reference.json";
import type { CalendarAlerts } from "../src/contract/generated/calendar";
import { calendarReference } from "../src/mock/calendar-reference";
import { calendarEventsText as text } from "../src/renderer/i18n/calendarEvents";
import { eventDays, raceDay } from "../src/renderer/screens/calendar/events";
import { CalendarEventsView } from "../src/renderer/ui/CalendarEventsView";

afterEach(cleanup);
it("keeps post-midnight starts in the previous racing night and compresses only mixed days", () => {
  const schedule = calendarReference().official;
  if (!schedule) throw new Error("missing publication");
  const series = {
    ...schedule.series[0],
    eventKind: "weekly",
    recurrence: {
      kind: "weekly-slots",
      intervalMinutes: 0,
      days: ["Thu"],
      timesUTC: ["00:00", "02:00", "20:00", "22:00"],
    },
  };
  const groups = eventDays(
    schedule,
    series,
    Date.parse("2026-10-08T21:00:00Z"),
    true,
    1000,
  );
  expect(
    groups.map((group) => [group.day, group.hidden, group.slots.length]),
  ).toEqual([
    [Date.parse("2026-10-07T00:00:00Z"), 0, 2],
    [Date.parse("2026-10-08T00:00:00Z"), 1, 1],
  ]);
  expect(raceDay(Date.parse("2026-10-08T03:00:00Z"), true)).toBe(
    Date.parse("2026-10-08T00:00:00Z"),
  );
});
it("routes favorite, slot and launch actions without changing the public schedule", () => {
  const view = calendarReference(),
    schedule = view.official;
  if (!schedule) throw new Error("missing publication");
  const snapshot = JSON.stringify(schedule),
    follow = vi.fn(),
    slot = vi.fn(),
    launch = vi.fn();
  render(
    <CalendarEventsView
      schedule={schedule}
      alerts={alerts as CalendarAlerts}
      following={view.following}
      now={Date.parse("2026-10-08T17:47:13Z")}
      utc
      limit={1000}
      profile="Carrera LMU"
      onFollow={follow}
      onSerie={() => {}}
      onDetail={() => {}}
      onToggleSlot={slot}
      onLaunch={launch}
      onExport={() => {}}
    />,
  );
  const event = within(screen.getByRole("article", { name: "WEC Weekly" }));
  fireEvent.click(event.getByRole("button", { name: text.inFavorites }));
  expect(follow).toHaveBeenCalledWith("weekly-wec-weekly", false);
  fireEvent.click(event.getByRole("button", { name: /^18:00\s*siguiente$/u }));
  expect(slot).toHaveBeenCalledWith(
    "weekly-wec-weekly",
    Date.parse("2026-10-08T18:00:00Z"),
  );
  fireEvent.click(
    event.getByRole("button", { name: text.launch("Carrera LMU") }),
  );
  expect(launch).toHaveBeenCalledOnce();
  expect(JSON.stringify(schedule)).toBe(snapshot);
  expect(screen.getByText(text.udpRequired)).toBeTruthy();
});
it("does not fabricate an event when the publication contains only daily series", () => {
  const source = calendarReference().official;
  if (!source) throw new Error("missing publication");
  const schedule = { ...source, series: [source.series[0]] };
  render(
    <CalendarEventsView
      schedule={schedule}
      alerts={alerts as CalendarAlerts}
      following={[]}
      now={Date.parse("2026-10-08T17:47:13Z")}
      utc
      limit={1000}
      onFollow={() => {}}
      onSerie={() => {}}
      onDetail={() => {}}
      onToggleSlot={() => {}}
      onLaunch={() => {}}
      onExport={() => {}}
    />,
  );
  expect(screen.getByRole("heading", { name: text.empty })).toBeTruthy();
});

it("keeps revoked launch and favorite actions disabled and does not invent missing actions", () => {
  const view = calendarReference();
  if (!view.official) throw new Error("Missing public schedule");
  const follow = vi.fn(),
    launch = vi.fn();
  render(
    <CalendarEventsView
      schedule={view.official}
      alerts={alerts as CalendarAlerts}
      following={view.following}
      now={Date.parse("2026-10-08T17:47:13Z")}
      utc
      limit={10000}
      profile="Carrera LMU"
      canLaunch={false}
      canFollow={false}
      onFollow={follow}
      onLaunch={launch}
    />,
  );
  const event = within(screen.getByRole("article", { name: "WEC Weekly" }));
  for (const button of [
    event.getByRole("button", { name: text.inFavorites }),
    event.getByRole("button", { name: text.launch("Carrera LMU") }),
    event.getByRole("button", { name: text.detail }),
    event.getByRole("button", { name: text.export }),
    event.getByRole("button", { name: /^18:00\s*siguiente$/u }),
  ]) {
    expect(button).toHaveProperty("disabled", true);
    fireEvent.click(button);
  }
  expect(follow).not.toHaveBeenCalled();
  expect(launch).not.toHaveBeenCalled();
});
