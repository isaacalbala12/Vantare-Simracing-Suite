import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { StrategySessionCombinationV1 } from "../../strategy/strategy-application-client";
import { StrategyRecordedWizard } from "./StrategyRecordedWizard";
import { createRecordedWizardDraft, type RecordedWizardDraft } from "./strategy-recorded-wizard";

afterEach(cleanup);
const car: StrategySessionCombinationV1 = { combinationId: "lmu:spa", simId: "lmu", trackName: "Spa", trackLayout: "Endurance", carName: "Car", carClass: "LMP2", sessionCount: 1, raceCount: 1, climateBuckets: [], sessions: [] };
const t = (key: string) => key;
function Parent({ initial = createRecordedWizardDraft(), open = () => {}, discover = () => {} }: { initial?: RecordedWizardDraft; open?: (draft: RecordedWizardDraft) => void; discover?: () => void }) {
  const [draft, setDraft] = useState(initial);
  return <StrategyRecordedWizard draft={draft} onChange={setDraft} catalog={[car]} catalogState="available" calendar={null} onDiscover={discover} sessions={<p>Real session owner slot</p>} onOpenDraft={() => open(draft)} onExit={() => {}} t={t} />;
}
const next = () => fireEvent.click(screen.getByRole("button", { name: "strategy.journey.next →" }));

it("walks exactly five steps, retains configuration and only submits the draft at the end", () => {
  const open = vi.fn();
  render(<Parent open={open} />);
  expect(screen.getAllByRole("listitem")).toHaveLength(5);
  next();
  next();
  expect(screen.getByRole("alert").textContent).toContain("strategy.journey.error.combination");
  fireEvent.change(screen.getByRole("combobox", { name: "strategy.journey.car" }), { target: { value: JSON.stringify(["LMP2", "Car"]) } });
  fireEvent.change(screen.getByRole("combobox", { name: "strategy.journey.track" }), { target: { value: car.combinationId } });
  next();
  fireEvent.change(screen.getByRole("spinbutton", { name: "strategy.journey.fuel.reserve" }), { target: { value: "2" } });
  fireEvent.click(screen.getByRole("button", { name: "← strategy.journey.back" }));
  next();
  expect((screen.getByRole("spinbutton", { name: "strategy.journey.fuel.reserve" }) as HTMLInputElement).value).toBe("2");
  next();
  expect(screen.getByRole("heading", { name: "strategy.journey.drivers.title" })).toBeTruthy();
  next();
  expect(screen.getByText("Real session owner slot")).toBeTruthy();
  expect(open).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "strategy.journey.openDraft →" }));
  expect(open).toHaveBeenCalledOnce();
  expect(open.mock.lastCall?.[0]).toMatchObject({ step: "sessions", fuelReserveLiters: 2, sessions: [], race: { format: "timed" } });
  expect(open.mock.lastCall?.[0].tankLiters).toBeUndefined();
});

it("requests discovery on automatic continuation, never just from selecting the mode", () => {
  const discover = vi.fn();
  render(<Parent discover={discover} />);
  fireEvent.click(screen.getByRole("button", { name: /strategy.journey.automatic / }));
  expect(discover).not.toHaveBeenCalled();
  next();
  expect(discover).toHaveBeenCalledOnce();
});

it("blocks a contradictory fuel setup without losing the draft", () => {
  render(<Parent initial={{ ...createRecordedWizardDraft(), step: "rules", combination: car, tankLiters: 70, initialFuelLiters: 80 }} />);
  next();
  expect(screen.getByRole("alert").textContent).toContain("strategy.journey.error.fuel");
  expect(screen.getByRole("heading", { name: "strategy.journey.rules.title" })).toBeTruthy();
});
