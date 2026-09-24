import { cleanup, render, screen } from "@testing-library/react";
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
