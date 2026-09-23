import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { StrategyPlanningInputsV2 } from "../../strategy/strategy-application-client";
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

it("shows the verified COTA catalog outline in the race context without deriving a map from the filename", () => {
  const input = props();
  const cota = { ...combination, combinationId: "lmu:cota", trackName: "Circuit of the Americas", trackLayout: "Circuit of the Americas" };
  render(<StrategyRecordedPreparation {...input} draft={{ ...input.draft, combination: cota }} />);
  const context = screen.getByRole("complementary", { name: "strategy.entry.circuitAndSource" });
  expect(within(context).getByRole("img", { name: "strategy.entry.catalogMap" }).querySelector("path")?.getAttribute("d")).toMatch(/^M /);
  expect(within(context).getByText("strategy.entry.catalogMapSource")).toBeTruthy();
});

it("shows canonical observed values and a separate preview bucket without changing the race climate", () => {
  const input = props();
  const ref = { sessionId: "base-a", revisionId: "revision-a", baseDigest: "a".repeat(64), snapshotId: "b".repeat(64) };
  const draft = { ...input.draft, mode: "automatic" as const, combination, sessions: [ref] };
  const valid = { presence: "valid", provenance: { kind: "analysis" }, confidence: "high" };
  const planning = { overrides: {}, projection: {
    representativePaceByClimateBucket: { dry: { ...valid, medianLapSeconds: 122.345 }, humid: { ...valid, presence: "missing" }, wet: { ...valid, medianLapSeconds: 131 } },
    fuelConsumption: { ...valid, meanPerLap: 2.37 }, virtualEnergyConsumption: { ...valid, meanPerLap: 0.8 },
  } } as unknown as StrategyPlanningInputsV2;
  render(<StrategyRecordedPreparation {...input} draft={draft} references={{ status: "ready", planning }} />);
  const cards = screen.getByRole("region", { name: "strategy.entry.referenceTitle" });
  expect(within(cards).getByText("2:02.345")).toBeTruthy();
  expect(within(cards).getByText("2.37")).toBeTruthy();
  expect(within(cards).getByText("0.8")).toBeTruthy();
  fireEvent.change(within(cards).getByRole("combobox", { name: "strategy.entry.previewClimate" }), { target: { value: "humid" } });
  expect(within(cards).queryByText("2:02.345")).toBeNull();
  expect(within(cards).getByText("strategy.entry.referenceMissing")).toBeTruthy();
  expect(input.onChange).not.toHaveBeenCalled();
});

it("shows a source-opening cause and action for a saved draft without a live handle", () => {
  const input = props();
  render(<StrategyRecordedPreparation {...input} draft={{ ...input.draft, mode: "automatic" }} references={{ status: "open_sources" }} />);
  const cards = screen.getByRole("region", { name: "strategy.entry.referenceTitle" });
  expect(within(cards).getByText("strategy.entry.referenceOpenSources")).toBeTruthy();
  fireEvent.click(within(cards).getByRole("button", { name: "strategy.entry.openTelemetry" }));
  expect(input.onDiscover).toHaveBeenCalledOnce();
});

it("does not substitute a climate mean for a missing bucket and labels a valid override", () => {
  const input = props();
  const ref = { sessionId: "base-a", revisionId: "revision-a", baseDigest: "a".repeat(64), snapshotId: "b".repeat(64) };
  const draft = { ...input.draft, mode: "automatic" as const, combination, sessions: [ref], virtualEnergy: { applicability: "applicable" as const } };
  const valid = { presence: "valid", provenance: { kind: "analysis" }, confidence: "high" };
  const projection = {
    representativePaceByClimateBucket: { dry: { ...valid, medianLapSeconds: 122 }, wet: { ...valid, medianLapSeconds: 130 } },
    fuelConsumption: { ...valid, meanPerLap: 2.37, byClimateBucket: { dry: 2.5 } },
    virtualEnergyConsumption: { ...valid, presence: "invalid", meanPerLap: 0 },
  };
  const view = render(<StrategyRecordedPreparation {...input} draft={draft} references={{ status: "ready", planning: { overrides: {}, projection } as unknown as StrategyPlanningInputsV2 }} />);
  const cards = screen.getByRole("region", { name: "strategy.entry.referenceTitle" });
  fireEvent.change(within(cards).getByRole("combobox", { name: "strategy.entry.previewClimate" }), { target: { value: "wet" } });
  const fuel = within(cards).getByText("strategy.entry.referenceFuel").closest("article")!;
  expect(within(fuel).getByText("—")).toBeTruthy();
  expect(within(fuel).getByText("strategy.entry.referenceBucketMissing")).toBeTruthy();
  const energy = within(cards).getByText("strategy.entry.referenceEnergy").closest("article")!;
  expect(within(energy).getByText("strategy.entry.referenceInvalid")).toBeTruthy();
  view.rerender(<StrategyRecordedPreparation {...input} draft={draft} references={{ status: "ready", planning: {
    overrides: { fuel_per_lap_liters: { value: 0, presence: "valid", provenance: { kind: "manual" }, confidence: "high" } }, projection,
  } as unknown as StrategyPlanningInputsV2 }} />);
  expect(within(fuel).getByText("—")).toBeTruthy();
  expect(within(fuel).getByText("strategy.entry.referenceInvalid")).toBeTruthy();
  expect(fuel.textContent).not.toContain("strategy.entry.referenceManual");
  view.rerender(<StrategyRecordedPreparation {...input} draft={draft} references={{ status: "ready", planning: {
    overrides: { fuel_per_lap_liters: { value: 2.1, presence: "valid", provenance: { kind: "manual" }, confidence: "high" } }, projection,
  } as unknown as StrategyPlanningInputsV2 }} />);
  expect(within(fuel).getByText("2.10")).toBeTruthy();
  expect(fuel.textContent).toContain("strategy.entry.referenceManual");
});
