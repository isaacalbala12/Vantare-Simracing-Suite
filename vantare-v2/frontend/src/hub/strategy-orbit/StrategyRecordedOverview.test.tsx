import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { StrategyRecordedOverview, StrategyRecordedRaceContext } from "./StrategyRecordedOverview";
import { createRecordedWizardDraft, type RecordedCalendarSnapshot } from "./strategy-recorded-wizard";
import type { StrategyOrbitCalculatedPlanV1 } from "../../strategy/strategy-application-client";
import type { RecordedCalculationState } from "./use-recorded-calculation";

afterEach(cleanup);
const props = { draft: createRecordedWizardDraft(), dirty: true, busy: false, calculation: { status: "idle" } as RecordedCalculationState, onEdit: vi.fn(), onPlan: vi.fn(), onSave: vi.fn(), t: (key: string) => key };
it("keeps missing configuration explicit and opens the existing Plan from its real idle state", () => {
  render(<StrategyRecordedOverview {...props} />);
  expect(screen.queryByText("strategy.workspace.noSources")).toBeNull();
  expect(screen.getByText("strategy.workspace.notCalculated")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "strategy.entry.openPlan" }));
  expect(props.onPlan).toHaveBeenCalledOnce();
  expect(screen.queryByRole("button", { name: "strategy.workspace.calculate" })).toBeNull();
  expect(screen.getAllByText("strategy.workspace.pending").length).toBeGreaterThan(0);
  expect(screen.getByRole("status").textContent).toBe("strategy.workspace.unsaved");
});
it("reflects a calculated result instead of a permanent uncalculated placeholder", () => {
  const plan = { totalLaps: 4, total: 360, stops: 0, maxLaps: 4, avgFuel: 2, avgPace: 90, stints: [], distribution: [], drivingSeconds: 360, pitSeconds: 0, startFuelLiters: 10, finishFuelLiters: 2, reserveLaps: 1, reserveRequiredLaps: 1, reserveSatisfied: true, stopDetails: [], savingApplied: false } satisfies StrategyOrbitCalculatedPlanV1;
  const calculation = { status: "success", input: { activeVariantId: "main" }, result: { plans: { main: plan }, comparisons: {} } } as unknown as RecordedCalculationState;
  const view = render(<StrategyRecordedOverview {...props} calculation={calculation} />);
  expect(screen.getByText("strategy.calculation.ready")).toBeTruthy();
  expect(screen.queryByText("strategy.workspace.notCalculated")).toBeNull();
  view.rerender(<StrategyRecordedOverview {...props} calculation={{ status: "success", input: { activeVariantId: "new" }, result: { plans: { main: plan }, comparisons: {} } } as unknown as RecordedCalculationState} />);
  expect(screen.getByText("strategy.calculation.missing")).toBeTruthy();
});
it("shows the calendar event separately from the race title and never labels another simulator as LMU", () => {
  const draft = { ...props.draft, name: "Mi estrategia", calendar: { series: { name: "Copa Vantare" } } as RecordedCalendarSnapshot,
    combination: { combinationId: "other", simId: "acc", trackName: "Misano", trackLayout: "Misano", carName: "GT3", carClass: "GT3" } };
  render(<><StrategyRecordedOverview {...props} draft={draft} /><StrategyRecordedRaceContext draft={draft} sessions={[]} sessionLabels={{}} busy={false} onSources={vi.fn()} t={props.t} /></>);
  expect(screen.getByText("Copa Vantare")).toBeTruthy();
  expect(screen.getAllByText("Mi estrategia")).toHaveLength(2);
  expect(screen.getByText("ACC")).toBeTruthy();
  expect(screen.queryByText("Le Mans Ultimate")).toBeNull();
  expect(screen.getByText("strategy.entry.mapUnavailable")).toBeTruthy();
});
it("routes editing to preparation and review from the shared context", () => {
  render(<StrategyRecordedOverview {...props} />);
  render(<StrategyRecordedRaceContext draft={props.draft} sessions={[]} sessionLabels={{}} busy={false} onSources={vi.fn()} t={props.t} />);
  fireEvent.click(screen.getByRole("button", { name: "strategy.workspace.edit strategy.journey.step.rules" }));
  expect(props.onEdit).toHaveBeenCalledWith("rules");
  expect(screen.getByRole("button", { name: "strategy.workspace.review" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "strategy.workspace.save" }));
  expect(props.onSave).toHaveBeenCalledOnce();
});
it("does not offer save while clean or busy, and reports a write failure", () => {
  const { rerender } = render(<StrategyRecordedOverview {...props} dirty={false} />);
  expect((screen.getByRole("button", { name: "strategy.workspace.save" }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByRole("status").textContent).toBe("strategy.workspace.saved");
  rerender(<StrategyRecordedOverview {...props} busy error="Storage failed" />);
  expect((screen.getByRole("button", { name: "strategy.workspace.save" }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByRole("alert").textContent).toBe("Storage failed");
});
