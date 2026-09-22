import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { createRecordedWizardDraft } from "./strategy-recorded-wizard";
import { StrategyRecordedPreparation } from "./StrategyRecordedPreparation";

afterEach(cleanup);
const t = (key: string) => key;
const combination = { combinationId: "lmu:imola", simId: "lmu", trackName: "Imola", trackLayout: "GP", carName: "Car", carClass: "LMP2" };
function props() {
  return {
    draft: { ...createRecordedWizardDraft(), mode: "manual" as const },
    onChange: vi.fn(), catalog: [combination], catalogState: "available" as const,
    calendar: null, sessions: [], sessionLabels: {}, onDiscover: vi.fn(),
    onOpenDraft: vi.fn(), onExit: vi.fn(), onSave: vi.fn(),
    busy: false, dirty: true, canOpenDraft: true, openDraftHint: "", t,
  };
}

it("keeps combination folded while the race desk shows references and saves the same draft", () => {
  const input = props();
  render(<StrategyRecordedPreparation {...input} />);
  const context = screen.getByRole("complementary", { name: "strategy.entry.circuitAndSource" });
  expect(screen.queryByRole("combobox", { name: "strategy.journey.car" })).toBeNull();
  expect(screen.queryByText("strategy.workspace.title")).toBeNull();
  fireEvent.click(within(context).getByRole("button", { name: /strategy.entry.changeCombination/ }));
  const car = screen.getByRole("combobox", { name: "strategy.journey.car" });
  fireEvent.change(car, { target: { value: JSON.stringify([combination.carClass, combination.carName]) } });
  fireEvent.change(screen.getByRole("combobox", { name: "strategy.journey.track" }), { target: { value: combination.combinationId } });
  expect(input.onChange).toHaveBeenLastCalledWith(expect.objectContaining({ combination: expect.objectContaining({ combinationId: combination.combinationId }) }));
  fireEvent.click(within(context).getByRole("button", { name: /strategy.entry.changeCombination/ }));
  expect(screen.queryByRole("combobox", { name: "strategy.journey.car" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "strategy.workspace.save" }));
  expect(input.onSave).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("button", { name: "strategy.entry.editRules ↗" }));
  expect(screen.getByRole("spinbutton", { name: "strategy.journey.fuel.capacity" })).toBeTruthy();
});

it("labels only the selected exact revision and leaves telemetry reference values pending", () => {
  const input = props();
  const selected = { sessionId: "base-a", revisionId: "revision-a", baseDigest: "a".repeat(64), snapshotId: "b".repeat(64) };
  const draft = { ...input.draft, mode: "automatic" as const, combination, sessions: [selected] };
  const sessions = [{ candidateId: "candidate", revision: { sessionId: "base-a", revisionId: "revision-b" } }];
  const view = render(<StrategyRecordedPreparation {...input} draft={draft} sessions={sessions} sessionLabels={{ candidate: "actual-session.duckdb" }} />);
  expect(screen.queryByText("actual-session.duckdb")).toBeNull();
  expect(screen.getByRole("heading", { name: "strategy.entry.fromLapsRace" })).toBeTruthy();
  const references = screen.getByRole("region", { name: "strategy.entry.referenceTitle" });
  expect(within(references).getAllByText("—")).toHaveLength(2);
  view.rerender(<StrategyRecordedPreparation {...input} draft={draft} sessions={[{ ...sessions[0], revision: { sessionId: "base-a", revisionId: "revision-a" } }]} sessionLabels={{ candidate: "actual-session.duckdb" }} />);
  expect(screen.getAllByText("actual-session.duckdb")).toHaveLength(2);
  expect(within(references).getAllByText("—")).toHaveLength(2);
});

it("rounds a manual pace across the minute boundary in the reference card", () => {
  const input = props();
  const draft = { ...input.draft, manualInputs: { paceSeconds: 59.9999 } };
  render(<StrategyRecordedPreparation {...input} draft={draft} />);
  expect(within(screen.getByRole("region", { name: "strategy.entry.referenceTitle" })).getByText("1:00.000")).toBeTruthy();
});
