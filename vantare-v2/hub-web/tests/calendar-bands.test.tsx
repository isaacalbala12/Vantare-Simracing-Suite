// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { calendarBandText as text } from "../src/renderer/i18n/calendarBands";
import { shiftBand } from "../src/renderer/screens/calendar/bands";
import { CalendarBandControls } from "../src/renderer/ui/CalendarBandControls";

afterEach(cleanup);
const band = {
  seriesId: "daily",
  from: 1200,
  to: 1380,
  days: "all",
  mode: "each",
} as const;
function controls(busy = false, enabled = true) {
  const onBand = vi.fn(),
    onLead = vi.fn();
  render(
    <CalendarBandControls
      seriesId="daily"
      band={enabled ? band : undefined}
      defaultBand={band}
      every={15}
      lead={10}
      leads={[5, 10, 15]}
      days={["all", "weekdays", "weekend"]}
      modes={["each", "first"]}
      stepMinutes={30}
      dayMinutes={1440}
      busy={busy}
      onBand={onBand}
      onLead={onLead}
    />,
  );
  return { onBand, onLead };
}
it("uses the GPUI half-hour cycle at the start and end of the day", () => {
  expect(shiftBand({ ...band, from: 1350 }, false, 30, 1440).from).toBe(0);
  expect(shiftBand({ ...band, to: 1440 }, true, 30, 1440).to).toBe(1230);
  expect(shiftBand({ ...band, to: 1430 }, true, 30, 1440).to).toBe(1440);
  expect(shiftBand(band, false, 30, 1440)).toEqual({ ...band, from: 1230 });
});
it("edits the band, days and lead through explicit controls", () => {
  const { onBand, onLead } = controls();
  fireEvent.click(screen.getByRole("button", { name: text.startAt("20:00") }));
  expect(onBand).toHaveBeenLastCalledWith({ ...band, from: 1230 });
  fireEvent.click(screen.getByRole("button", { name: "Finde" }));
  expect(onBand).toHaveBeenLastCalledWith({ ...band, days: "weekend" });
  fireEvent.click(screen.getByRole("button", { name: "Solo la primera" }));
  expect(onBand).toHaveBeenLastCalledWith({ ...band, mode: "first" });
  fireEvent.click(screen.getByRole("button", { name: "15′" }));
  expect(onLead).toHaveBeenLastCalledWith(15);
  fireEvent.click(screen.getByRole("switch", { name: text.toggle }));
  expect(onBand).toHaveBeenLastCalledWith(undefined);
});
it("enables the supplied default without inventing a second preference", () => {
  const { onBand } = controls(false, false);
  fireEvent.click(screen.getByRole("switch", { name: text.toggle }));
  expect(onBand).toHaveBeenCalledWith(band);
});
it("blocks every edit while a write is pending", () => {
  const { onBand, onLead } = controls(true);
  for (const button of screen.getAllByRole("button")) fireEvent.click(button);
  fireEvent.click(screen.getByRole("switch", { name: text.toggle }));
  expect(onBand).not.toHaveBeenCalled();
  expect(onLead).not.toHaveBeenCalled();
});

it("clips a late end-of-day cycle before returning a writable band", () => {
  expect(shiftBand({ ...band, from: 1430, to: 1440 }, true, 30, 1440)).toEqual({
    ...band,
    from: 1430,
    to: 1440,
  });
});
it("announces separate day selection and the visible start/end times", () => {
  controls();
  expect(screen.getByRole("group", { name: text.daysLabel })).toBeTruthy();
  expect(
    screen.getByRole("button", { name: text.startAt("20:00") }),
  ).toBeTruthy();
  expect(
    screen.getByRole("button", { name: text.endAt("23:00") }),
  ).toBeTruthy();
});
it("keeps a zero interval display finite without sending a change", () => {
  const change = vi.fn();
  const { container } = render(
    <CalendarBandControls
      seriesId="daily"
      band={band}
      defaultBand={band}
      every={0}
      lead={10}
      leads={[5, 10, 15]}
      days={["all", "weekdays", "weekend"]}
      modes={["each", "first"]}
      stepMinutes={30}
      dayMinutes={1440}
      busy={false}
      onBand={change}
    />,
  );
  expect(container.textContent).not.toMatch(/NaN|Infinity/u);
  expect(change).not.toHaveBeenCalled();
});
