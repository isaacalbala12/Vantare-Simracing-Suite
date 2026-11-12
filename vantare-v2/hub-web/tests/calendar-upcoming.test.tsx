// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import fixture from "../fixtures/calendar-demo.json";
import { calendarText as text } from "../src/renderer/i18n/calendar";
import { CalendarLiveView } from "../src/renderer/ui/CalendarLiveView";
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
      onRefresh={refresh}
      busy={false}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: text.retry }));
  expect(refresh).toHaveBeenCalledOnce();
  expect(screen.queryByText(fixture.series[0].name)).toBeNull();
});
it("keeps expired rows read-only and exposes refresh and next-week preference", () => {
  const refresh = vi.fn();
  render(
    <CalendarUpcomingView
      previous={fixture}
      utc={true}
      following={0}
      limit={1000}
      notifyWeek={true}
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
  const control = screen.getByRole("switch", { name: text.notifyWeek });
  expect(control.getAttribute("aria-disabled")).toBe("true");
  expect(control.getAttribute("aria-checked")).toBe("true");
  expect(
    document.getElementById(control.getAttribute("aria-describedby") ?? "")
      ?.textContent,
  ).toBe(text.notifyWeekPending);
});

it("filters live sessions and routes favorite changes without mutating the publication", () => {
  const follow = vi.fn(),
    detail = vi.fn();
  const snapshot = JSON.stringify(fixture);
  render(
    <CalendarLiveView
      schedule={fixture}
      alerts={{
        leadMin: 10,
        bands: [],
        slots: [],
        channels: { windows: true, inTrack: true, sound: false },
        autoLaunch: false,
        notifyWeek: true,
      }}
      following={[]}
      utc
      now={Date.parse(fixture.validFrom)}
      limit={1000}
      onFollow={follow}
      onDetail={detail}
      onLaunch={() => {}}
    />,
  );
  expect(screen.queryByRole("searchbox")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: text.search }));
  fireEvent.change(screen.getByRole("searchbox"), {
    target: { value: fixture.series[0].name },
  });
  fireEvent.click(
    screen.getByRole("button", {
      name: text.toggleFavorite(fixture.series[0].name),
    }),
  );
  expect(follow).toHaveBeenCalledWith(fixture.series[0].id, true);
  expect(JSON.stringify(fixture)).toBe(snapshot);
  fireEvent.change(screen.getByRole("searchbox"), {
    target: { value: "no-matching-calendar-series" },
  });
  expect(screen.getByText(text.noResults)).toBeTruthy();
});

it("keeps scheduled launch visible but inactive while immediate launch remains explicit", () => {
  const launch = vi.fn();
  render(
    <CalendarLiveView
      schedule={fixture}
      alerts={{
        leadMin: 10,
        bands: [],
        slots: [],
        channels: { windows: true, inTrack: true, sound: false },
        autoLaunch: false,
        notifyWeek: true,
      }}
      following={[fixture.series[0].id]}
      utc
      now={Date.parse(fixture.validFrom)}
      limit={10000}
      profile="QA"
      onFollow={() => {}}
      onDetail={() => {}}
      onLaunch={launch}
    />,
  );
  const scheduled = screen.getByRole("button", { name: /Lanzar a las/u });
  expect(scheduled.hasAttribute("disabled")).toBe(true);
  fireEvent.click(scheduled);
  expect(launch).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: /Lanzar «QA»/u }));
  expect(launch).toHaveBeenCalledOnce();
});

it.each([false, true])(
  "keeps the saved next-week notification value (%s) read only",
  (saved) => {
    render(
      <CalendarUpcomingView
        previous={fixture}
        utc
        following={0}
        limit={1000}
        notifyWeek={saved}
        onRefresh={() => {}}
        busy={false}
      />,
    );
    const control = screen.getByRole("switch", { name: text.notifyWeek });
    fireEvent.click(control);
    fireEvent.keyDown(control, { key: " " });
    expect(control.getAttribute("aria-checked")).toBe(String(saved));
    expect(control.getAttribute("aria-disabled")).toBe("true");
    expect(screen.getByRole("status").textContent).toBe(text.notifyWeekPending);
  },
);
