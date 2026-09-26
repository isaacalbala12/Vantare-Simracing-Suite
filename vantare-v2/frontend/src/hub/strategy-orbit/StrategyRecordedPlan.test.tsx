import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { StrategyRecordedPlan } from "./StrategyRecordedPlan";
import { createRecordedWizardDraft } from "./strategy-recorded-wizard";
import type { RecordedAcceptanceController } from "./use-recorded-acceptance";

afterEach(cleanup);

it("describes manual references without implying a telemetry session is required", () => {
  render(<StrategyRecordedPlan
    draft={{ ...createRecordedWizardDraft(), mode: "manual", sessions: [], drivers: [{ id: "driver", name: "Alex" }] }}
    state={{ status: "idle" }}
    acceptance={{ state: { status: "idle" } } as RecordedAcceptanceController}
    locked={false}
    onChange={vi.fn()}
    onCalculate={vi.fn()}
    onRecalculateStints={vi.fn()}
    onRecalculatePits={vi.fn()}
    onCancel={vi.fn()}
    t={key => key}
  />);

  expect(screen.getAllByText("strategy.workspace.manualReferences").length).toBeGreaterThan(0);
  expect(screen.getByText("strategy.workspace.manualEstimate")).toBeTruthy();
  expect(screen.queryByText("0 strategy.workspace.selectedSources")).toBeNull();
  expect(screen.queryByText("strategy.workspace.sources")).toBeNull();
});

it("blocks calculation and offers source recovery when a saved revision is not open", () => {
  const onCalculate = vi.fn();
  const onSources = vi.fn();
  render(<StrategyRecordedPlan
    draft={{ ...createRecordedWizardDraft(), mode: "automatic", calculationMode: "dry", sessions: [{ sessionId: "source", baseDigest: "a".repeat(64), revisionId: "b".repeat(64), snapshotId: "c".repeat(64) }] }}
    state={{ status: "idle" }}
    acceptance={{ state: { status: "idle" } } as RecordedAcceptanceController}
    locked={false}
    sourceUnavailable
    onSources={onSources}
    onChange={vi.fn()}
    onCalculate={onCalculate}
    onRecalculateStints={vi.fn()}
    onRecalculatePits={vi.fn()}
    onCancel={vi.fn()}
    t={key => key}
  />);

  expect(screen.getByRole<HTMLButtonElement>("button", { name: "strategy.workspace.calculate" }).disabled).toBe(true);
  expect(screen.getByText("strategy.entry.referenceOpenSources")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "strategy.entry.openTelemetry" }));
  expect(onSources).toHaveBeenCalledOnce();
  expect(onCalculate).not.toHaveBeenCalled();
});
