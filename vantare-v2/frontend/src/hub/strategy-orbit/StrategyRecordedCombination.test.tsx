import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { Calendar } from "../../calendar/calendar-types";
import type { StrategySessionCombinationV1 } from "../../strategy/strategy-application-client";
import { StrategyRecordedCombination } from "./StrategyRecordedCombination";
import { createRecordedWizardDraft, selectRecordedCombination } from "./strategy-recorded-wizard";

afterEach(cleanup);
const car: StrategySessionCombinationV1 = { combinationId: "lmu:spa", simId: "lmu", trackName: "Spa", trackLayout: "Endurance", carName: "Car", carClass: "LMP2", sessionCount: 1, raceCount: 1, climateBuckets: [], sessions: [] };
const catalog = [car, { ...car, combinationId: "lmu:monza", trackName: "Monza", trackLayout: "GP" }];
const t = (key: string) => key;
const props = { draft: createRecordedWizardDraft(), catalog, catalogState: "available" as const, calendar: null, onCombination: vi.fn(), onCalendar: vi.fn(), onDiscover: vi.fn(), t };

it("chooses the car and exact track in a single combination screen", () => {
  function Parent() {
    const [draft, setDraft] = useState(createRecordedWizardDraft);
    return <StrategyRecordedCombination {...props} draft={draft} onCombination={id => setDraft(current => selectRecordedCombination(current, id, catalog))} />;
  }
  render(<Parent />);
  const track = screen.getByRole("combobox", { name: "strategy.journey.track" });
  expect((track as HTMLSelectElement).disabled).toBe(true);
  fireEvent.change(screen.getByRole("combobox", { name: "strategy.journey.car" }), { target: { value: JSON.stringify(["LMP2", "Car"]) } });
  fireEvent.change(track, { target: { value: "lmu:monza" } });
  expect(screen.getByRole("heading", { name: "Monza" })).toBeTruthy();
  fireEvent.change(screen.getByRole("combobox", { name: "strategy.journey.car" }), { target: { value: "" } });
  expect(screen.queryByRole("heading", { name: "Monza" })).toBeNull();
});

it("keeps custom selection usable while the calendar is unavailable", () => {
  const onCalendar = vi.fn();
  render(<StrategyRecordedCombination {...props} onCalendar={onCalendar} />);
  fireEvent.click(screen.getByRole("button", { name: /strategy.journey.calendar / }));
  expect(screen.getByText("strategy.journey.calendar.unavailable")).toBeTruthy();
  expect((screen.getByRole("combobox", { name: "strategy.journey.car" }) as HTMLSelectElement).disabled).toBe(false);
  expect(onCalendar).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: /strategy.journey.custom / }));
  expect(onCalendar).toHaveBeenCalledExactlyOnceWith(undefined);
});

it("offers published calendar series without silently selecting or applying one", () => {
  const onCalendar = vi.fn();
  const calendar: Calendar = { version: 1, updated: "2026-09-09", timezone: "UTC", reminderMinutes: [], events: [], series: [{ id: "race", name: "Endurance", track: "Spa", tier: "advanced", licenseLabel: "Gold", vehicleClass: "LMP2", setup: "fixed", durationMin: 120, splits: 1, assists: "", tyreWarmers: true, tyres: 12, recurrence: { kind: "weekly" } }] };
  render(<StrategyRecordedCombination {...props} calendar={calendar} onCalendar={onCalendar} />);
  fireEvent.click(screen.getByRole("button", { name: /strategy.journey.calendar / }));
  expect(onCalendar).not.toHaveBeenCalled();
  fireEvent.change(screen.getByRole("combobox", { name: "strategy.journey.calendar.event" }), { target: { value: "race" } });
  expect(onCalendar).toHaveBeenCalledExactlyOnceWith("race");
});

it("never fabricates a combination while discovery is unavailable", () => {
  const onDiscover = vi.fn();
  const view = render(<StrategyRecordedCombination {...props} catalog={[]} catalogState="loading" onDiscover={onDiscover} />);
  const discover = screen.getByRole("button", { name: "strategy.recorded.discover" });
  expect((discover as HTMLButtonElement).disabled).toBe(true);
  view.rerender(<StrategyRecordedCombination {...props} catalog={[]} catalogState="unavailable" onDiscover={onDiscover} />);
  fireEvent.click(discover);
  expect(onDiscover).toHaveBeenCalledOnce();
  expect(screen.getByText("strategy.journey.catalog.unavailable")).toBeTruthy();
});
