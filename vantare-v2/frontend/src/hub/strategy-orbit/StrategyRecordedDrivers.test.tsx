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

it("removes dependent estimates when their reference driver is removed", () => {
  const changed = vi.fn();
  render(<Editor changed={changed} />);
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "primary" } });
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
