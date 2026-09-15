import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { StrategyOrbitCalculatedPlanV1, StrategyOrbitCalculationInputV1 } from "../../strategy/strategy-application-client";
import { StrategyRecordedPitEditor } from "./StrategyRecordedPitEditor";

const plan = {
  stopDetails: [{ index: 0, lap: 12, fuelInLiters: 2, fuelOutLiters: 20, virtualEnergyInPercent: 10, virtualEnergyOutPercent: 40, pitLossSeconds: 26, pitTransitSeconds: 20, pitServiceSeconds: 8, pitOverlapSeconds: 2, pitBreakdownAvailable: true, changeTyres: false, compound: "medium" }],
  stints: [{ compound: "medium" }, { compound: "medium" }],
} as unknown as StrategyOrbitCalculatedPlanV1;
const tyre = (id: string, compound: "medium" | "hard") => ({
  id, compound, origin: "event_allocation" as const, state: "free" as const, stints: 0,
  condition: { minimumRemainingPercent: 100, maximumRemainingPercent: 100, provenance: { kind: "observed" as const }, confidence: { level: "high" as const } },
});
const input = {
  event: { raceKind: "laps", targetLaps: 20, durationMinutes: 0, tankLiters: 100, pitLossSeconds: 20, virtualEnergy: { applicability: "applicable", capacityPercent: 100, reservePercent: 0 }, pitServices: { transitSeconds: 20, refuelRateLPerS: 2, veRatePPerS: 4, tyreSeconds: 8, serviceMode: "parallel" }, tyreInventory: { maximum: 8, tyres: [tyre("m1", "medium"), tyre("h1", "hard")] } },
  drivers: [{ id: "alex", name: "Alex" }], variants: [{ id: "recorded-main", mode: "dry", order: ["alex"], overrides: {} }], activeVariantId: "recorded-main",
} satisfies StrategyOrbitCalculationInputV1;

afterEach(cleanup);

describe("StrategyRecordedPitEditor", () => {
  it("edits every backed service, exposes the exact breakdown and resets", () => {
    const onDirtyChange = vi.fn();
    const onRecalculate = vi.fn();
    render(<StrategyRecordedPitEditor plan={plan} input={input} locked={false} onDirtyChange={onDirtyChange} onRecalculate={onRecalculate} t={key => key} />);

    expect(screen.getByText("20 s")).toBeTruthy();
    expect(screen.getByText("8 s")).toBeTruthy();
    expect(screen.getByText("−2 s")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("strategy.pitEdit.fuelAdded 1"), { target: { value: "22" } });
    fireEvent.change(screen.getByLabelText("strategy.pitEdit.veAdded 1"), { target: { value: "35" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "strategy.pitEdit.changeTyres 1" }));
    fireEvent.change(screen.getByLabelText("strategy.pitEdit.compound 1"), { target: { value: "hard" } });
    expect(screen.getByRole("status").textContent).toBe("strategy.pitEdit.stale");
    fireEvent.click(screen.getByRole("button", { name: "strategy.pitEdit.recalculate" }));
    expect(onRecalculate).toHaveBeenCalledWith([{ index: 0, fuelLiters: 22, vePercent: 35, changeTyres: true, compound: "hard" }]);

    fireEvent.click(screen.getByRole("button", { name: "strategy.pitEdit.reset" }));
    expect((screen.getByLabelText("strategy.pitEdit.fuelAdded 1") as HTMLInputElement).value).toBe("18");
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
  });

  it("omits unsupported controls and locks edits", () => {
    const unsupported = { ...input, event: { ...input.event, virtualEnergy: { applicability: "not_applicable" as const }, tyreInventory: undefined } };
    render(<StrategyRecordedPitEditor plan={{ ...plan, stopDetails: [{ ...plan.stopDetails[0], virtualEnergyInPercent: undefined, virtualEnergyOutPercent: undefined }] }} input={unsupported} locked onDirtyChange={vi.fn()} onRecalculate={vi.fn()} t={key => key} />);
    expect(screen.queryByLabelText("strategy.pitEdit.veAdded 1")).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.getByText("strategy.pitEdit.tyresUnavailable")).toBeTruthy();
    expect((screen.getByLabelText("strategy.pitEdit.fuelAdded 1") as HTMLInputElement).disabled).toBe(true);
  });
});
