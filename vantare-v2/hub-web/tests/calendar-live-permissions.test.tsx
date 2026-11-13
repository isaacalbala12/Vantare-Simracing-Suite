// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import alerts from "../fixtures/calendar-alerts-reference.json";
import type { CalendarAlerts } from "../src/contract/generated/calendar";
import { calendarReference } from "../src/mock/calendar-reference";
import { calendarLaunchText } from "../src/renderer/i18n/calendarLaunch";
import {
  type CalendarLiveFilters,
  CalendarLiveView,
} from "../src/renderer/ui/CalendarLiveView";

afterEach(cleanup);
it("keeps the profile visible while launch and protected favorite writes are disabled", () => {
  const value = calendarReference(),
    follow = vi.fn(),
    launch = vi.fn();
  if (!value.official) throw new Error("Missing public reference schedule");
  render(
    <CalendarLiveView
      schedule={value.official}
      alerts={alerts as CalendarAlerts}
      following={value.following}
      utc={false}
      now={Date.parse("2026-10-08T17:47:13Z")}
      limit={10000}
      profile="Carrera LMU"
      canLaunch={false}
      canFollow={false}
      onFollow={follow}
      onLaunch={launch}
    />,
  );
  expect(screen.getAllByText(/Sebring WEC/)).toHaveLength(2);
  const deferred = screen.getByRole("button", { name: /Lanzar a las/ });
  expect(deferred).toHaveProperty("disabled", true);
  expect(
    document.getElementById(deferred.getAttribute("aria-describedby") ?? "")
      ?.textContent,
  ).toBe(calendarLaunchText.onlyOpen);
  expect(screen.getByText(/\d{2}:\d{2} WEC Weekly/)).toBeTruthy();
  const axis = document.querySelectorAll(".v-calendar-timeline-axis time");
  expect(axis.length).toBe(7);
  expect(axis[0].getAttribute("style")).toContain("left:");
  const launchButton = screen.getByRole("button", {
    name: /Lanzar «Carrera LMU»/,
  });
  expect((launchButton as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(launchButton);
  const stars = screen.getAllByRole("button", { name: /^Alternar favorita:/ });
  expect(stars.length).toBeGreaterThan(0);
  for (const star of stars) {
    expect((star as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(star);
  }
  expect(follow).not.toHaveBeenCalled();
  expect(launch).not.toHaveBeenCalled();
  expect(
    (screen.getByRole("button", { name: "Ficha" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
});

it("routes series names separately from a departure Ficha", () => {
  const value = calendarReference(),
    onSerie = vi.fn(),
    onDetail = vi.fn();
  if (!value.official) throw new Error("Missing public reference schedule");
  const { container } = render(
    <CalendarLiveView
      schedule={value.official}
      alerts={alerts as CalendarAlerts}
      following={value.following}
      utc
      now={Date.parse("2026-10-08T17:47:13Z")}
      limit={10000}
      onFollow={vi.fn()}
      onLaunch={vi.fn()}
      onSerie={onSerie}
      onDetail={onDetail}
    />,
  );
  const series = [
    ...container.querySelectorAll<HTMLButtonElement>(".v-calendar-live-series"),
  ].find((button) => button.textContent?.includes("LMGT3 Fixed"));
  if (!series) throw new Error("Missing series name");
  fireEvent.click(series);
  expect(onSerie).toHaveBeenCalledWith("beginner-lmgt3-fixed");
  expect(onDetail).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Ficha" }));
  expect(onDetail).toHaveBeenCalledOnce();
  expect(onSerie).toHaveBeenCalledOnce();
});

it("restores the favorite filter after returning from a series", () => {
  const value = calendarReference();
  if (!value.official) throw new Error("Missing publication");
  const schedule = value.official;
  let saved: CalendarLiveFilters = {
    searchOpen: false,
    query: "",
    tier: "all",
    only: "all",
    vehicle: "all",
  };
  const remember = (next: CalendarLiveFilters) => {
    saved = next;
  };
  const mount = () =>
    render(
      <CalendarLiveView
        schedule={schedule}
        alerts={alerts as CalendarAlerts}
        following={value.following}
        utc
        now={Date.parse("2026-10-08T17:47:13Z")}
        limit={10000}
        onFollow={vi.fn()}
        onLaunch={vi.fn()}
        initialFilters={saved}
        onFiltersChange={remember}
      />,
    );
  const first = mount();
  fireEvent.click(screen.getByRole("button", { name: /^Favoritas/ }));
  first.unmount();
  mount();
  expect(
    screen
      .getByRole("button", { name: /^Favoritas/ })
      .getAttribute("aria-pressed"),
  ).toBe("true");
  expect(document.querySelectorAll(".v-calendar-live-series")).toHaveLength(3);
});

it("paints the clipped notice band without making it an interactive control", () => {
  const value = calendarReference();
  if (!value.official) throw new Error("Missing public reference schedule");
  render(
    <CalendarLiveView
      schedule={value.official}
      alerts={{
        ...(alerts as CalendarAlerts),
        bands: [
          {
            seriesId: value.official.series[0].id,
            from: 0,
            to: 1440,
            days: "all",
            mode: "each",
          },
        ],
      }}
      following={value.following}
      utc
      now={Date.parse("2026-10-08T17:47:13Z")}
      limit={10000}
      onFollow={vi.fn()}
      onLaunch={vi.fn()}
    />,
  );
  expect(
    document.querySelector(".v-calendar-time[data-alert] svg"),
  ).toBeTruthy();
  const band = document.querySelector<HTMLElement>(".v-calendar-time-band");
  expect(band?.style.left).toBe("0%");
  expect(band?.style.width).toBe("100%");
  expect(band?.getAttribute("aria-hidden")).toBe("true");
  expect(band?.getAttribute("tabindex")).toBeNull();
});

it("arms the visible departure exactly once and blocks a second click while pending",()=>{
 const value=calendarReference();if(!value.official)throw new Error("Missing schedule");const arm=vi.fn();
 const props={schedule:value.official,alerts:alerts as CalendarAlerts,following:value.following,utc:true,now:Date.parse("2026-10-08T17:47:13Z"),limit:10000,onFollow:vi.fn(),onLaunch:vi.fn(),onArm:arm};
 const h=render(<CalendarLiveView {...props}/>);const button=screen.getByRole("button",{name:/Lanzar a las/});expect(button).toHaveProperty("disabled",false);fireEvent.click(button);expect(arm).toHaveBeenCalledOnce();expect(arm.mock.calls[0][0]).toBeTruthy();expect(arm.mock.calls[0][1]).toBeGreaterThan(props.now);
 h.rerender(<CalendarLiveView {...props} armBusy/>);fireEvent.click(button);expect(arm).toHaveBeenCalledOnce();
});
