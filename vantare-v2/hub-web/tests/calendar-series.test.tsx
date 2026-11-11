// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import fixture from "../fixtures/calendar-demo.json";
import { CalendarSeriesView } from "../src/renderer/ui/CalendarSeriesView";

const series = fixture.series.find((s) => s.recurrence.kind === "interval");
if (!series) throw new Error("fixture must include a daily series");
const seriesId = series.id;
afterEach(cleanup);
const from = Date.parse(fixture.validFrom);
function view(id = seriesId, enabled = true) {
  const onBack = vi.fn(),
    onFollow = vi.fn(),
    onDetail = vi.fn();
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
      onSeries={() => {}}
      onFollow={onFollow}
      onLaunch={() => {}}
      onDetail={enabled ? onDetail : undefined}
      onSlot={enabled ? () => {} : undefined}
    />,
  );
  return { onBack, onFollow, onDetail, ...result };
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
