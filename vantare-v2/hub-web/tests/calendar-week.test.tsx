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
import { calendarWeekText as text } from "../src/renderer/i18n/calendarWeek";
import {
  type CalendarWeekState,
  CalendarWeekView,
} from "../src/renderer/ui/CalendarWeekView";

afterEach(cleanup);
const alerts = {
  leadMin: 10,
  bands: [],
  slots: [],
  channels: { windows: true, inTrack: true, sound: false },
  autoLaunch: false,
  notifyWeek: true,
};
it("keeps the current publication and routes favorite actions by series id", async () => {
  const follow = vi.fn(),
    span = vi.fn(),
    full = vi.fn();
  const view = calendarReference();
  view.utc = true;
  const original = JSON.stringify(view);
  render(
    <CalendarWeekView
      spans={["day", "week", "month"]}
      view={view}
      alerts={alerts}
      now={Date.parse("2026-10-08T17:47:13Z")}
      limit={1000}
      onSpan={span}
      onFull={full}
      onFollow={follow}
      onDetail={() => {}}
    />,
  );
  fireEvent.click(
    screen.getByRole("button", { name: text.favorite("LMGT3 Fixed") }),
  );
  expect(follow).toHaveBeenCalledWith("beginner-lmgt3-fixed", false);
  expect(JSON.stringify(view)).toBe(original);
  fireEvent.click(screen.getByRole("button", { name: text.day }));
  expect(span).toHaveBeenCalledWith("day");
  fireEvent.click(screen.getByRole("button", { name: text.full }));
  expect(full).toHaveBeenCalledOnce();
  expect(screen.getByRole("dialog", { name: text.calendar })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: text.previous }));
  fireEvent.click(screen.getByRole("button", { name: text.full }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(
    screen.getByRole("heading", { name: "Semana pasada · 29 sep–5 oct" }),
  ).toBeTruthy();
});
it("shows an unpublished week without inventing departures and permits returning to today", () => {
  const view = calendarReference();
  view.utc = true;
  render(
    <CalendarWeekView
      view={view}
      alerts={alerts}
      now={Date.parse("2026-10-08T17:47:13Z")}
      limit={1000}
      onSpan={() => {}}
      onFull={() => {}}
      onFollow={() => {}}
      onDetail={() => {}}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: text.next }));
  expect(
    screen.getByRole("heading", { name: text.unpublished("13–19 oct") }),
  ).toBeTruthy();
  expect(
    screen.queryByRole("button", { name: text.favorite("LMGT3 Fixed") }),
  ).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: text.today }));
  expect(
    screen.getByRole("button", { name: text.favorite("LMGT3 Fixed") }),
  ).toBeTruthy();
});

it("keeps previous publications read-only and labels weeks crossing a month", () => {
  const view = calendarReference();
  view.utc = true;
  render(
    <CalendarWeekView
      view={view}
      alerts={alerts}
      now={Date.parse("2026-10-08T17:47:13Z")}
      limit={1000}
      onSpan={() => {}}
      onFull={() => {}}
      onFollow={() => {}}
      onDetail={() => {}}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: text.previous }));
  expect(
    screen.getByRole("heading", { name: "Semana pasada · 29 sep–5 oct" }),
  ).toBeTruthy();
  expect(
    screen.queryByRole("button", { name: text.favorite("LMGT3 Fixed") }),
  ).toBeNull();
});

it("marks the upcoming daily departure with its band bell", () => {
  const view = calendarReference();
  view.utc = true;
  const { container } = render(
    <CalendarWeekView
      view={view}
      now={Date.parse("2026-10-08T17:47:13Z")}
      limit={10000}
      onFollow={() => {}}
      alerts={{
        ...alerts,
        bands: [
          {
            seriesId: "beginner-lmgt3-fixed",
            from: 0,
            to: 1440,
            days: "all",
            mode: "each",
          },
        ],
      }}
    />,
  );
  const marker = container.querySelector(
    ".v-calendar-week-live-daily > button > b",
  );
  expect(marker?.textContent).toContain("18:00");
  expect(marker?.querySelector("svg")).not.toBeNull();
});

it("restores the selected week and favorites after returning from a series", () => {
  let saved: CalendarWeekState = { offset: 0, filter: "all" };
  const remember = (next: CalendarWeekState) => {
    saved = next;
  };
  const view = calendarReference();
  view.utc = true;
  const mount = () =>
    render(
      <CalendarWeekView
        view={view}
        alerts={alerts}
        now={Date.parse("2026-10-08T17:47:13Z")}
        limit={1000}
        onFollow={vi.fn()}
        initialState={saved}
        onViewStateChange={remember}
      />,
    );
  const first = mount();
  fireEvent.click(screen.getByRole("button", { name: text.previous }));
  fireEvent.click(screen.getByRole("button", { name: text.favorites }));
  first.unmount();
  mount();
  expect(
    screen.getByRole("heading", { name: "Semana pasada · 29 sep–5 oct" }),
  ).toBeTruthy();
  expect(
    screen
      .getByRole("button", { name: text.favorites })
      .getAttribute("aria-pressed"),
  ).toBe("true");
});
