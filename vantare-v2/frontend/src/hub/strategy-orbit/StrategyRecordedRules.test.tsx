import { useState } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { StrategyRecordedRules } from "./StrategyRecordedRules";
import { createRecordedWizardDraft, type RecordedWizardDraft } from "./strategy-recorded-wizard";

afterEach(cleanup);
const t = (key: string) => key;
function Editor({ initial = createRecordedWizardDraft(), changed = () => {} }: { initial?: RecordedWizardDraft; changed?: (draft: RecordedWizardDraft) => void }) {
  const [draft, setDraft] = useState(initial);
  return <StrategyRecordedRules draft={draft} t={t} onChange={next => { setDraft(next); changed(next); }} />;
}

it("keeps blank resources distinct from configured zero and removes a cleared value", () => {
  const changed = vi.fn();
  render(<Editor changed={changed} />);
  const reserve = screen.getByRole("spinbutton", { name: "strategy.journey.fuel.reserve" }) as HTMLInputElement;
  expect(reserve.value).toBe("");
  expect((screen.getByRole("spinbutton", { name: "strategy.journey.fuel.capacity" }) as HTMLInputElement).value).toBe("");
  fireEvent.change(reserve, { target: { value: "0" } });
  expect(changed.mock.lastCall?.[0].fuelReserveLiters).toBe(0);
  fireEvent.change(reserve, { target: { value: "" } });
  expect(changed.mock.lastCall?.[0].fuelReserveLiters).toBeUndefined();
});

it("requires explicit applicability before editing virtual energy and preserves entered values", () => {
  const changed = vi.fn();
  render(<Editor changed={changed} />);
  expect(screen.queryByRole("spinbutton", { name: "strategy.journey.energy.reservePercent" })).toBeNull();
  const applicability = screen.getByRole("combobox", { name: "strategy.journey.energy" });
  fireEvent.change(applicability, { target: { value: "applicable" } });
  fireEvent.change(screen.getByRole("spinbutton", { name: "strategy.journey.energy.reservePercent" }), { target: { value: "5" } });
  fireEvent.change(applicability, { target: { value: "not_applicable" } });
  expect(changed.mock.lastCall?.[0].virtualEnergy).toEqual({ applicability: "not_applicable", reservePercent: 5 });
  fireEvent.change(applicability, { target: { value: "applicable" } });
  expect((screen.getByRole("spinbutton", { name: "strategy.journey.energy.reservePercent" }) as HTMLInputElement).value).toBe("5");
});

it("does not reinterpret minutes as laps when changing the race format", () => {
  const changed = vi.fn();
  render(<Editor initial={{ ...createRecordedWizardDraft(), race: { format: "timed", durationMin: 120 } }} changed={changed} />);
  fireEvent.change(screen.getByRole("combobox", { name: "strategy.journey.race.format" }), { target: { value: "laps" } });
  expect(changed.mock.lastCall?.[0].race).toEqual({ format: "laps" });
  fireEvent.change(screen.getByRole("spinbutton", { name: "strategy.journey.race.laps" }), { target: { value: "50" } });
  expect(changed.mock.lastCall?.[0].race).toEqual({ format: "laps", laps: 50 });
});

it("updates stop counts without dropping other sourced rule values", () => {
  const changed = vi.fn();
  const rules = { minPitStops: 1, requiredWindows: [{ fromLap: 10, toLap: 20 }] };
  render(<Editor initial={{ ...createRecordedWizardDraft(), rules }} changed={changed} />);
  fireEvent.click(screen.getByText("strategy.journey.rules.stops"));
  fireEvent.change(screen.getByRole("spinbutton", { name: "strategy.journey.pit.max" }), { target: { value: "3" } });
  expect(changed.mock.lastCall?.[0].rules).toEqual({ ...rules, maxPitStops: 3 });
  expect(rules).toEqual({ minPitStops: 1, requiredWindows: [{ fromLap: 10, toLap: 20 }] });
});

it("adds, edits and removes complete required pit windows without dropping other rules", () => {
  const changed = vi.fn();
  render(<Editor initial={{ ...createRecordedWizardDraft(), rules: { minPitStops: 1 } }} changed={changed} />);
  fireEvent.click(screen.getByText("strategy.journey.rules.stops"));

  expect((screen.getByRole("button", { name: "strategy.journey.pit.window.add" }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(screen.getByRole("spinbutton", { name: "strategy.journey.pit.window.newFromLap" }), { target: { value: "10" } });
  fireEvent.change(screen.getByRole("spinbutton", { name: "strategy.journey.pit.window.newToLap" }), { target: { value: "20" } });
  fireEvent.click(screen.getByRole("button", { name: "strategy.journey.pit.window.add" }));
  fireEvent.change(screen.getByRole("spinbutton", { name: "strategy.journey.pit.window.newFromLap" }), { target: { value: "30" } });
  fireEvent.change(screen.getByRole("spinbutton", { name: "strategy.journey.pit.window.newToLap" }), { target: { value: "40" } });
  fireEvent.click(screen.getByRole("button", { name: "strategy.journey.pit.window.add" }));
  expect(changed.mock.lastCall?.[0].rules).toEqual({ minPitStops: 1, requiredWindows: [{ fromLap: 10, toLap: 20 }, { fromLap: 30, toLap: 40 }] });

  const first = screen.getByRole("group", { name: "strategy.journey.pit.window.label 1" });
  const firstStart = within(first).getByRole("spinbutton", { name: "strategy.journey.pit.window.fromLap" });
  fireEvent.change(firstStart, { target: { value: "" } });
  expect(changed.mock.lastCall?.[0].rules).toEqual({ minPitStops: 1, requiredWindows: [{ fromLap: 10, toLap: 20 }, { fromLap: 30, toLap: 40 }] });
  fireEvent.change(firstStart, { target: { value: "15" } });
  expect(changed.mock.lastCall?.[0].rules).toEqual({ minPitStops: 1, requiredWindows: [{ fromLap: 15, toLap: 20 }, { fromLap: 30, toLap: 40 }] });
  fireEvent.change(within(first).getByRole("spinbutton", { name: "strategy.journey.pit.window.toLap" }), { target: { value: "22" } });
  fireEvent.click(screen.getByRole("button", { name: "strategy.journey.pit.window.remove 2" }));
  expect(changed.mock.lastCall?.[0].rules).toEqual({ minPitStops: 1, requiredWindows: [{ fromLap: 15, toLap: 22 }] });
  fireEvent.click(screen.getByRole("button", { name: "strategy.journey.pit.window.remove 1" }));
  expect(changed.mock.lastCall?.[0].rules).toEqual({ minPitStops: 1 });
});
