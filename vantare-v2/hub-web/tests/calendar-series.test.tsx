// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { afterEach, expect, it, vi } from "vitest";
import fixture from "../fixtures/calendar-demo.json";
import { CalendarSeriesView } from "../src/renderer/ui/CalendarSeriesView";

const series = fixture.series.find((s) => s.recurrence.kind === "interval");
if (!series) throw new Error("fixture must include a daily series");
const seriesId = series.id;
afterEach(cleanup);
const from = Date.parse(fixture.validFrom);
function view(
  id = seriesId,
  enabled = true,
  changes: Partial<ComponentProps<typeof CalendarSeriesView>> = {},
) {
  const onBack = vi.fn(),
    onFollow = vi.fn(),
    onDetail = vi.fn(),
    onSeries = vi.fn();
  const result = render(
    <CalendarSeriesView
      schedule={fixture}
      canFollow={enabled}
      canLaunch={enabled}
      seriesId={id}
      alerts={{
        leadMin: 10,
        bands: [],
        slots: [],
        channels: { windows: true, inTrack: true, sound: false },
        autoLaunch: false,
        notifyWeek: true,
      }}
      utc
      now={from}
      limit={10000}
      favorite={false}
      profile="QA"
      backLabel="Próximas"
      alertControls={<span>Band controls</span>}
      onBack={onBack}
      onSeries={onSeries}
      onFollow={onFollow}
      onLaunch={() => {}}
      onDetail={enabled ? onDetail : undefined}
      onSlot={enabled ? () => {} : undefined}
      {...changes}
    />,
  );
  return { onBack, onFollow, onDetail, onSeries, ...result };
}
it("keeps navigation, favorites and selected departures as explicit callbacks", () => {
  const v = view();
  expect(screen.getByRole("heading", { name: series.name })).toBeTruthy();
  expect(screen.getByText("Band controls")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Favorita" }));
  expect(v.onFollow).toHaveBeenCalledWith(true);
  const first = v.container.querySelector<HTMLButtonElement>(
    ".v-calendar-serie-chips button",
  );
  if (!first) throw new Error("missing upcoming departure");
  fireEvent.click(first);
  expect(v.onDetail).toHaveBeenCalledWith(series.id, expect.any(Number));
  fireEvent.click(screen.getByRole("button", { name: "Próximas" }));
  expect(v.onBack).toHaveBeenCalledOnce();
  expect(
    v.container.querySelectorAll(".v-calendar-serie-map-hour"),
  ).toHaveLength(168);
});
it("offers a way back if a refreshed publication removes the selected series", () => {
  const v = view("absent");
  expect(screen.getByText("Esta serie ya no está en el horario")).toBeTruthy();
  expect(screen.queryByText("Band controls")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Volver" }));
  expect(v.onBack).toHaveBeenCalledOnce();
});

it("keeps unavailable actions disabled while departures remain readable information", () => {
  const v = view(seriesId, false);
  const favorite = screen.getByRole("button", { name: "Favorita" });
  expect(favorite).toHaveProperty("disabled", true);
  expect(screen.getByRole("button", { name: /Lanzar.*QA/ })).toHaveProperty(
    "disabled",
    true,
  );
  const departure = v.container.querySelector<HTMLElement>(
    ".v-calendar-serie-chips .v-calendar-serie-info",
  );
  expect(departure?.textContent).toMatch(/\d{2}:\d{2}/u);
  expect(
    v.container.querySelector(".v-calendar-serie-chips button"),
  ).toBeNull();
  fireEvent.click(favorite);
  if (departure) fireEvent.click(departure);
  expect(v.onFollow).not.toHaveBeenCalled();
  expect(v.onDetail).not.toHaveBeenCalled();
});

it.each([45, 90])(
  "describes non-hour-dividing interval %i without empty minute labels",
  (every) => {
    const schedule = {
      ...fixture,
      series: [
        {
          ...series,
          recurrence: { ...series.recurrence, intervalMinutes: every },
        },
      ],
    };
    view(seriesId, true, { schedule });
    expect(
      screen.getByText(`Sale cada ${every} min, todo el día.`),
    ).toBeTruthy();
    expect(screen.queryByText("Sale a los minutos")).toBeNull();
  },
);
it("limits compact departures to nine and provides a focused title and map alternative", () => {
  const old = window.innerWidth;
  Object.defineProperty(window, "innerWidth", {
    value: 1440,
    writable: true,
    configurable: true,
  });
  const v = view();
  expect(
    v.container.querySelectorAll(".v-calendar-serie-chips button"),
  ).toHaveLength(12);
  expect(document.activeElement).toBe(
    screen.getByRole("heading", { name: series.name }),
  );
  expect(
    screen.getByRole("img", { name: /salidas durante la semana publicada/u }),
  ).toBeTruthy();
  window.innerWidth = 1399;
  fireEvent(window, new Event("resize"));
  expect(
    v.container.querySelectorAll(".v-calendar-serie-chips button"),
  ).toHaveLength(9);
  window.innerWidth = old;
});
it("keeps weekly departures grouped and never labels an old slot as next", () => {
  const weekly = fixture.series.find(
    (s) => s.recurrence.kind === "weekly-slots",
  );
  if (!weekly) throw new Error("weekly fixture missing");
  const v = view(weekly.id, true, { now: Date.parse(fixture.validUntil) - 1 });
  expect(
    screen.getByRole("heading", { name: "Todas sus tandas" }),
  ).toBeTruthy();
  expect(
    v.container.querySelectorAll(".v-calendar-serie-fixed-day").length,
  ).toBeGreaterThan(0);
  expect(
    v.container.querySelector(".v-calendar-serie-fixed [data-next]"),
  ).toBeNull();
  expect(
    v.container.querySelector(".v-calendar-serie-fixed button"),
  ).toBeNull();
});
it("ignores the empty placeholder and the selected series in the real select", async () => {
  const user = userEvent.setup(),
    v = view();
  for (const name of ["Cambiar serie", series.name]) {
    const select = screen.getByRole("combobox", { name: "Cambiar serie" });
    if (select.getAttribute("aria-expanded") !== "true")
      await user.click(select);
    await user.click(await screen.findByRole("option", { name }));
  }
  expect(v.onSeries).not.toHaveBeenCalled();
});
