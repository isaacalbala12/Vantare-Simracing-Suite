// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { calendarReference } from "../src/mock/calendar-reference";
import { calendarMonthText as text } from "../src/renderer/i18n/calendarMonth";
import { monthWeeks } from "../src/renderer/screens/calendar/month";
import { CalendarMonthView } from "../src/renderer/ui/CalendarMonthView";

afterEach(cleanup);
const alerts = {
  leadMin: 10,
  bands: [],
  slots: [],
  channels: { windows: true, inTrack: true, sound: false },
  autoLaunch: false,
  notifyWeek: true,
};
it("covers a month with Tuesday weeks and distinguishes cached and unpublished weeks", () => {
  const view = calendarReference();
  view.utc = true;
  const model = monthWeeks(
    view,
    Date.parse("2026-10-08T17:47:13Z"),
    0,
    true,
    alerts,
    1000,
  );
  expect(model.weeks).toHaveLength(5);
  expect(model.weeks.map((w) => w.state)).toEqual([
    "past",
    "now",
    "unpublished",
    "unpublished",
    "unpublished",
  ]);
  expect(model.weeks[0].start).toBe(Date.parse("2026-09-29T00:00:00Z"));
  expect(model.weeks[2].facts).toBeUndefined();
});
it("counts half-hour departures without inventing event bars", () => {
  const view = calendarReference();
  view.utc = true;
  if (!view.official) throw new Error("missing publication");
  const source = view.official.series[0];
  view.official = {
    ...view.official,
    series: [
      {
        ...source,
        eventKind: "daily",
        recurrence: {
          kind: "interval",
          intervalMinutes: 30,
          days: [],
          timesUTC: [],
        },
        startOffsetMinute: 0,
      },
    ],
  };
  const model = monthWeeks(
    view,
    Date.parse("2026-10-08T12:00:00Z"),
    0,
    true,
    alerts,
    1000,
  );
  const week = model.weeks[1],
    facts = week.facts?.[2];
  expect(facts?.total).toBe(48);
  expect(facts?.perHour).toEqual(Array(24).fill(2));
  expect(week.bars).toEqual([]);
});
it("routes a current event and month/view navigation", () => {
  const view = calendarReference();
  view.utc = true;
  const detail = vi.fn(),
    span = vi.fn();
  render(
    <CalendarMonthView
      view={view}
      alerts={alerts}
      now={Date.parse("2026-10-08T17:47:13Z")}
      limit={1000}
      onSpan={span}
      onFull={() => {}}
      onDetail={detail}
    />,
  );
  expect(screen.getByRole("heading", { name: "Octubre 2026" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "WEC Weekly · Sebring" }));
  expect(detail).toHaveBeenCalledWith("weekly-wec-weekly");
  fireEvent.click(screen.getByRole("button", { name: text.week }));
  expect(span).toHaveBeenCalledWith("week");
  fireEvent.click(screen.getByRole("button", { name: text.next }));
  expect(screen.getByRole("heading", { name: "Noviembre 2026" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: text.today }));
  expect(screen.getByRole("heading", { name: "Octubre 2026" })).toBeTruthy();
});

it("preserves the chosen month through full screen and return", async () => {
  render(
    <CalendarMonthView
      view={calendarReference()}
      alerts={alerts}
      now={Date.parse("2026-10-08T17:47:13Z")}
      limit={10000}
      onSpan={() => {}}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: text.next }));
  fireEvent.click(screen.getByRole("button", { name: text.full }));
  expect(screen.getByRole("dialog", { name: text.calendar })).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Noviembre 2026" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: text.full }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(screen.getByRole("heading", { name: "Noviembre 2026" })).toBeTruthy();
});

it("keeps the expired publication's next week waiting, without manufacturing data", () => {
  const view = calendarReference();
  view.official = null;
  view.fallback = null;
  const model = monthWeeks(
    view,
    Date.parse("2026-10-08T17:47:13Z"),
    0,
    true,
    alerts,
    10000,
    true,
  );
  expect(model.weeks[1].state).toBe("now");
  expect(model.weeks[2].state).toBe("waiting");
  expect(model.weeks[2].facts).toBeUndefined();
});

it("groups a Friday small-hours event on Thursday while keeping Friday density", () => {
  const view = calendarReference();
  if (!view.official) throw new Error("missing publication");
  const event = view.official.series.find(
    (series) => series.recurrence.kind !== "interval",
  );
  if (!event) throw new Error("missing event");
  view.official.series = [
    {
      ...event,
      recurrence: {
        kind: "weekly-slots",
        days: ["Fri"],
        timesUTC: ["01:00"],
        intervalMinutes: 0,
      },
    },
  ];
  const week = monthWeeks(
    view,
    Date.parse("2026-10-08T17:47:13Z"),
    0,
    true,
    alerts,
    1000,
  ).weeks[1];
  expect(week.bars).toEqual([{ series: 0, from: 2, to: 2, lane: 0 }]);
  expect(week.facts?.[2].total).toBe(0);
  expect(week.facts?.[3].total).toBe(1);
});
