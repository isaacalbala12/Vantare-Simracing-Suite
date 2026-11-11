// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import fixture from "../fixtures/calendar-demo.json";
import { seriesHistory } from "../src/renderer/screens/calendar/series";
import { CalendarSeriesView } from "../src/renderer/ui/CalendarSeriesView";

const series = fixture.series.find((s) => s.recurrence.kind === "interval");
if (!series) throw new Error("fixture must include a daily series");
afterEach(cleanup);
const from = Date.parse(fixture.validFrom),
  until = Date.parse(fixture.validUntil);
it("counts only this series inside the published week, with GPUI integer rounding", () => {
  const run = {
    seriesId: series.id,
    at: from,
    bestLap: "2:01.384",
    position: 4,
    safetyTenths: 6,
  };
  expect(
    seriesHistory(
      [
        run,
        { ...run, position: 9, safetyTenths: -2 },
        { ...run, position: 6, safetyTenths: 9 },
        { ...run, position: 11, safetyTenths: 7 },
        { ...run, at: until },
        { ...run, seriesId: "other" },
      ],
      series.id,
      from,
      until,
    ),
  ).toEqual({ count: "4 carreras", best: "2:01.384", mean: "P7 · +2 SR" });
  expect(seriesHistory([], series.id, from, until)).toEqual({
    count: "Ninguna",
    best: "—",
    mean: "—",
  });
});
function view(id = series.id) {
  const onBack = vi.fn(),
    onFollow = vi.fn(),
    onDetail = vi.fn();
  const result = render(
    <CalendarSeriesView
      schedule={fixture}
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
      onDetail={onDetail}
      onSlot={() => {}}
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
