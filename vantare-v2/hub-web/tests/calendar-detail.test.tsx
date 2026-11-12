// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { type ComponentProps, useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import alerts from "../fixtures/calendar-alerts-reference.json";
import type { CalendarAlerts } from "../src/contract/generated/calendar";
import { calendarReference } from "../src/mock/calendar-reference";
import { calendarText } from "../src/renderer/i18n/calendar";
import { calendarDetailText as text } from "../src/renderer/i18n/calendarDetail";
import { CalendarDetail } from "../src/renderer/ui/CalendarDetail";
import { TooltipProvider } from "../src/renderer/ui/Layers";

const schedule = calendarReference().official;
if (!schedule) throw new Error("fixture publication missing");
const series = schedule.series.find((s) => s.id === "beginner-lmgt3-fixed");
if (!series) throw new Error("fixture series missing");
const props = {
  schedule,
  seriesId: series.id,
  now: Date.parse("2026-10-08T17:47:13Z"),
  utc: true,
  limit: 1000,
  alerts: alerts as CalendarAlerts,
  following: [],
  runs: [],
  canLaunch: true,
  canFollow: true,
  onClose: vi.fn(),
  onFollow: vi.fn(),
  onLaunch: vi.fn(),
};
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
function show(p: ComponentProps<typeof CalendarDetail> = props) {
  return render(
    <TooltipProvider>
      <CalendarDetail {...p} />
    </TooltipProvider>,
  );
}
it("selects a published departure, updates its phase times and keeps it across a clock tick", () => {
  const { rerender } = show();
  const dialog = screen.getByRole("dialog"),
    buttons = within(dialog).getAllByRole("button", { pressed: false });
  const choice = buttons.find((b) => /^18:15$/.test(b.textContent ?? ""));
  if (!choice) throw new Error("next departure missing");
  fireEvent.click(choice);
  expect(
    within(dialog).getByRole("button", { name: "18:15", pressed: true }),
  ).toBeTruthy();
  rerender(
    <TooltipProvider>
      <CalendarDetail {...props} now={props.now + 1000} />
    </TooltipProvider>,
  );
  expect(
    within(dialog).getByRole("button", { name: "18:15", pressed: true }),
  ).toBeTruthy();
  expect(within(dialog).getByText("18:26 carrera")).toBeTruthy();
});
it("routes favorite and safe launch actions; leaves undelivered actions disabled", () => {
  show();
  fireEvent.click(screen.getByRole("switch", { name: text.follow }));
  expect(props.onFollow).toHaveBeenCalledWith(series.id, true);
  fireEvent.click(screen.getByRole("button", { name: text.launch }));
  expect(props.onLaunch).toHaveBeenCalledOnce();
  expect(screen.getByRole("button", { name: text.add })).toHaveProperty(
    "disabled",
    true,
  );
  expect(screen.getByRole("button", { name: text.series })).toHaveProperty(
    "disabled",
    true,
  );
  const pending = screen.getByRole("button", { name: /Lanzar a las/u });
  expect(pending.getAttribute("aria-disabled")).toBe("true");
  pending.focus();
  expect(document.activeElement).toBe(pending);
  fireEvent.click(pending);
  expect(props.onLaunch).toHaveBeenCalledOnce();
  expect(pending.getAttribute("aria-description")).toBe(
    calendarText.launchPending,
  );
});
it("does not launch or change favorites when rights are unavailable and closes by its button", () => {
  show({ ...props, canLaunch: false, canFollow: false });
  fireEvent.click(screen.getByRole("button", { name: text.launch }));
  expect(props.onLaunch).not.toHaveBeenCalled();
  expect(
    screen
      .getByRole("switch", { name: text.follow })
      .getAttribute("aria-disabled"),
  ).toBe("true");
  fireEvent.click(screen.getByRole("button", { name: text.close }));
  expect(props.onClose).toHaveBeenCalledOnce();
});
it("closes on Escape through the real dialog", () => {
  show();
  fireEvent.keyDown(screen.getByRole("dialog"), {
    key: "Escape",
    code: "Escape",
  });
  expect(props.onClose).toHaveBeenCalledOnce();
});

it("opens the series page with its identity instead of inventing a target", () => {
  const onSerie = vi.fn();
  render(
    <TooltipProvider>
      <CalendarDetail {...props} onSerie={onSerie} />
    </TooltipProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: text.series }));
  expect(onSerie).toHaveBeenCalledWith(series.id);
});

it("shows the closed missing-series fallback and keeps its close action", () => {
  show({ ...props, seriesId: "missing-series" });
  expect(screen.getByRole("heading", { name: text.unknown })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: text.close }));
  expect(props.onClose).toHaveBeenCalledOnce();
});
it("matches GPUI for a past chosen departure: zero minutes and no selected future chip", () => {
  show({ ...props, initialAt: props.now - 60_000 });
  expect(screen.getByText("en 0 min")).toBeTruthy();
  expect(
    screen
      .queryAllByRole("button", { pressed: true })
      .filter((node) => /^\d{2}:\d{2}$/.test(node.textContent ?? "")),
  ).toHaveLength(0);
});
it("marks RaceControl fallback series", () => {
  show({
    ...props,
    schedule: { ...schedule, series: [{ ...series, source: "racecontrol" }] },
  });
  expect(screen.getByText(text.rc)).toBeTruthy();
});

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <TooltipProvider>
      <button type="button" onClick={() => setOpen(true)}>
        Open drawer
      </button>
      <button type="button">Window control</button>
      {open && <CalendarDetail {...props} onClose={() => setOpen(false)} />}
    </TooltipProvider>
  );
}

for (const method of ["escape", "button"] as const) {
  it(`restores the opening button on ${method} without making window controls inert`, async () => {
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Open drawer" });
    trigger.focus();
    fireEvent.click(trigger);
    const control = screen.getByRole("button", { name: "Window control" });
    expect(control.closest("[inert], [aria-hidden=true]")).toBeNull();
    control.focus();
    expect(document.activeElement).toBe(control);
    screen.getByRole("dialog").focus();
    if (method === "escape")
      fireEvent.keyDown(screen.getByRole("dialog"), {
        key: "Escape",
        code: "Escape",
      });
    else fireEvent.click(screen.getByRole("button", { name: text.close }));
    await vi.waitFor(() => expect(document.activeElement).toBe(trigger));
  });
}
