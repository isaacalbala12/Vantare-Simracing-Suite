import { useState } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { StrategyRecordedDrivers } from "./StrategyRecordedDrivers";
import type { RecordedWizardDraft } from "./strategy-recorded-wizard";

afterEach(cleanup);
const t = (key: string) => key;
const drivers = [{ id: "primary", name: "Alex" }, { id: "relay", name: "Sam" }];
function Editor({ changed, initial }: { changed: (draft: RecordedWizardDraft) => void; initial?: RecordedWizardDraft }) {
  const [value, setValue] = useState<RecordedWizardDraft>(initial ?? { step: "drivers", mode: "manual", name: "", race: { format: "timed" }, drivers, sessions: [], invalidatedSessionCount: 0 });
  return <StrategyRecordedDrivers draft={value} onChange={next => { setValue(next); changed(next); }} onAdd={() => {}} t={t} />;
}

it("shows an unassigned team without inventing a driver or pace", () => {
  const onAdd = vi.fn();
  render(<StrategyRecordedDrivers draft={{ step: "drivers", mode: "manual", name: "", race: { format: "timed" }, drivers: [], sessions: [], invalidatedSessionCount: 0 }} onChange={vi.fn()} onAdd={onAdd} t={t} />);
  expect(screen.getByRole("status").textContent).toBe("strategy.journey.driver.empty");
  expect(screen.queryByRole("spinbutton")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "+ strategy.journey.driver.add" }));
  expect(onAdd).toHaveBeenCalledOnce();
});

it("uses equal pace only after explicitly selecting an estimate, then accepts a signed delta", () => {
  const changed = vi.fn();
  render(<Editor changed={changed} />);
  const relay = within(screen.getByRole("region", { name: "strategy.journey.driver.label 2" }));
  expect(relay.queryByText("strategy.journey.driver.estimated")).toBeNull();
  fireEvent.change(relay.getByRole("combobox"), { target: { value: "primary" } });
  expect(changed.mock.lastCall?.[0].drivers[1]).toEqual({ id: "relay", name: "Sam", referenceDriverId: "primary", paceDeltaSeconds: 0 });
  expect(relay.getByText("strategy.journey.driver.estimateNotice")).toBeTruthy();
  fireEvent.change(relay.getByRole("spinbutton", { name: "strategy.journey.driver.delta" }), { target: { value: "-0.4" } });
  expect(changed.mock.lastCall?.[0].drivers[1].paceDeltaSeconds).toBe(-0.4);
  fireEvent.change(relay.getByRole("combobox"), { target: { value: "" } });
  expect(changed.mock.lastCall?.[0].drivers[1].referenceDriverId).toBeUndefined();
  expect(changed.mock.lastCall?.[0].drivers[1].paceDeltaSeconds).toBeUndefined();
});

it("edits and reorders the fixed driver sequence explicitly", () => {
  const changed = vi.fn();
  render(<Editor changed={changed} initial={{
    step: "drivers", mode: "manual", name: "", race: { format: "laps", laps: 50 }, drivers, sessions: [], invalidatedSessionCount: 0,
    driverOrder: { mode: "fixed", ids: ["primary", "relay"] },
  }} />);

  fireEvent.click(screen.getByRole("button", { name: "strategy.journey.driver.order.down Alex" }));
  expect(changed.mock.lastCall?.[0].driverOrder).toEqual({ mode: "fixed", ids: ["relay", "primary"] });
  fireEvent.change(screen.getByRole("combobox", { name: "strategy.journey.driver.order.mode" }), { target: { value: "free" } });
  expect(changed.mock.lastCall?.[0].driverOrder).toEqual({ mode: "free", ids: ["relay", "primary"] });
});

it("keeps free order visible but unavailable for timed races", () => {
  render(<Editor changed={vi.fn()} />);
  const selector = screen.getByRole("combobox", { name: "strategy.journey.driver.order.mode" });
  expect((within(selector).getByRole("option", { name: "strategy.journey.driver.order.free" }) as HTMLOptionElement).disabled).toBe(true);
  expect(screen.getByText("strategy.journey.driver.order.timedBlocked")).toBeTruthy();
});

it("removes dependent estimates when their reference driver is removed", () => {
  const changed = vi.fn();
  render(<Editor changed={changed} />);
  fireEvent.change(screen.getByRole("combobox", { name: "strategy.journey.driver.paceSource" }), { target: { value: "primary" } });
  fireEvent.click(screen.getByRole("button", { name: "strategy.journey.driver.remove Alex" }));
  expect(changed.mock.lastCall?.[0].drivers).toEqual([{ id: "relay", name: "Sam", referenceDriverId: undefined, paceDeltaSeconds: undefined }]);
  expect(screen.queryByText("strategy.journey.driver.estimated")).toBeNull();
  expect(screen.getByText("strategy.journey.driver.pacePending")).toBeTruthy();
});

it("stores driving limits in contract units, preserves absence and removes orphan limits", () => {
  const changed = vi.fn();
  render(<Editor changed={changed} />);
  const primary = within(screen.getByRole("region", { name: "strategy.journey.driver.label 1" }));

  fireEvent.change(primary.getByRole("spinbutton", { name: "strategy.journey.driver.minLaps" }), { target: { value: "12" } });
  fireEvent.change(primary.getByRole("spinbutton", { name: "strategy.journey.driver.maxLaps" }), { target: { value: "40" } });
  fireEvent.change(primary.getByRole("spinbutton", { name: "strategy.journey.driver.maxContinuousMinutes" }), { target: { value: "30" } });
  fireEvent.change(primary.getByRole("spinbutton", { name: "strategy.journey.driver.maxTotalMinutes" }), { target: { value: "90" } });
  expect(changed.mock.lastCall?.[0].rules?.driverLimits?.primary).toEqual({ minLaps: 12, maxLaps: 40, maxContinuousTimeSeconds: 1800, maxTotalTimeSeconds: 5400 });

  fireEvent.change(primary.getByRole("spinbutton", { name: "strategy.journey.driver.minLaps" }), { target: { value: "" } });
  fireEvent.change(primary.getByRole("spinbutton", { name: "strategy.journey.driver.maxContinuousMinutes" }), { target: { value: "" } });
  expect(changed.mock.lastCall?.[0].rules?.driverLimits?.primary).toEqual({ maxLaps: 40, maxTotalTimeSeconds: 5400 });

  fireEvent.click(primary.getByRole("button", { name: "strategy.journey.driver.remove Alex" }));
  expect(changed.mock.lastCall?.[0].rules?.driverLimits?.primary).toBeUndefined();
});

it("adds, edits and removes inclusive unavailable lap windows without losing other limits", () => {
  const changed = vi.fn();
  const initial = {
    step: "drivers", mode: "manual", name: "", race: { format: "laps", laps: 50 }, drivers, sessions: [], invalidatedSessionCount: 0,
    rules: { minPitStops: 1, driverLimits: { primary: { maxLaps: 40 }, relay: { minLaps: 5 } } },
  } satisfies RecordedWizardDraft;
  render(<Editor initial={initial} changed={changed} />);
  const primary = within(screen.getByRole("region", { name: "strategy.journey.driver.label 1" }));
  const availability = within(primary.getByRole("group", { name: "strategy.journey.driver.unavailable" }));
  expect(availability.getByText("strategy.journey.driver.unavailable.empty")).toBeTruthy();

  fireEvent.change(availability.getByRole("spinbutton", { name: "strategy.journey.driver.unavailable.newFromLap" }), { target: { value: "4" } });
  fireEvent.change(availability.getByRole("spinbutton", { name: "strategy.journey.driver.unavailable.newToLap" }), { target: { value: "4" } });
  fireEvent.click(availability.getByRole("button", { name: "strategy.journey.driver.unavailable.add" }));
  fireEvent.change(availability.getByRole("spinbutton", { name: "strategy.journey.driver.unavailable.newFromLap" }), { target: { value: "20" } });
  fireEvent.change(availability.getByRole("spinbutton", { name: "strategy.journey.driver.unavailable.newToLap" }), { target: { value: "25" } });
  fireEvent.click(availability.getByRole("button", { name: "strategy.journey.driver.unavailable.add" }));
  expect(changed.mock.lastCall?.[0].rules).toEqual({ minPitStops: 1, driverLimits: { primary: { maxLaps: 40, unavailable: [{ fromLap: 4, toLap: 4 }, { fromLap: 20, toLap: 25 }] }, relay: { minLaps: 5 } } });

  const first = within(availability.getByRole("group", { name: "strategy.journey.driver.unavailable.window.label 1" }));
  fireEvent.change(first.getByRole("spinbutton", { name: "strategy.journey.driver.unavailable.fromLap" }), { target: { value: "" } });
  expect(changed.mock.lastCall?.[0].rules?.driverLimits?.primary.unavailable).toEqual([{ fromLap: 4, toLap: 4 }, { fromLap: 20, toLap: 25 }]);
  fireEvent.change(first.getByRole("spinbutton", { name: "strategy.journey.driver.unavailable.fromLap" }), { target: { value: "5" } });
  fireEvent.change(first.getByRole("spinbutton", { name: "strategy.journey.driver.unavailable.toLap" }), { target: { value: "6" } });
  fireEvent.click(availability.getByRole("button", { name: "strategy.journey.driver.unavailable.remove 2" }));
  expect(changed.mock.lastCall?.[0].rules?.driverLimits?.primary).toEqual({ maxLaps: 40, unavailable: [{ fromLap: 5, toLap: 6 }] });
  fireEvent.click(availability.getByRole("button", { name: "strategy.journey.driver.unavailable.remove 1" }));
  expect(changed.mock.lastCall?.[0].rules).toEqual({ minPitStops: 1, driverLimits: { primary: { maxLaps: 40 }, relay: { minLaps: 5 } } });
});
