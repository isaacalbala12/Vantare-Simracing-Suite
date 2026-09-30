import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { StrategyOrbitCalculatedPlanV1 } from "../../strategy/strategy-application-client";
import { StrategyRecordedStintEditor } from "./StrategyRecordedStintEditor";

const plan = {
  totalLaps: 4,
  stints: [{ i: 0, d: "alex", laps: 2 }, { i: 1, d: "sam", laps: 2 }],
} as unknown as StrategyOrbitCalculatedPlanV1;
const drivers = [{ id: "alex", name: "Alex" }, { id: "sam", name: "Sam" }];

afterEach(cleanup);

describe("StrategyRecordedStintEditor", () => {
  it("moves a boundary identically by range or number and preserves total laps", () => {
    const onDirtyChange = vi.fn();
    const onRecalculate = vi.fn();
    render(<StrategyRecordedStintEditor plan={plan} drivers={drivers} locked={false} onDirtyChange={onDirtyChange} onRecalculate={onRecalculate} t={key => key} />);

    fireEvent.change(screen.getByLabelText("strategy.stint.dragBoundary 1"), { target: { value: "1" } });
    expect(screen.getByText("1 strategy.stint.laps")).toBeTruthy();
    expect(screen.getByText("3 strategy.stint.laps")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe("strategy.stint.stale");

    fireEvent.change(screen.getByLabelText("strategy.stint.numberBoundary 1"), { target: { value: "2" } });
    expect(screen.getAllByText("2 strategy.stint.laps")).toHaveLength(2);
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);

    fireEvent.change(screen.getAllByLabelText("strategy.stint.driver")[0], { target: { value: "sam" } });
    fireEvent.click(screen.getByRole("button", { name: "strategy.stint.recalculate" }));
    expect(onRecalculate).toHaveBeenCalledWith([
      { index: 0, driverId: "sam", laps: 2 },
      { index: 1, driverId: "sam", laps: 2 },
    ]);
  });

  it("resets pending edits and disables actions when locked", () => {
    const onDirtyChange = vi.fn();
    const view = render(<StrategyRecordedStintEditor plan={plan} drivers={drivers} locked={false} onDirtyChange={onDirtyChange} onRecalculate={vi.fn()} t={key => key} />);
    fireEvent.change(screen.getAllByLabelText("strategy.stint.driver")[0], { target: { value: "sam" } });
    fireEvent.click(screen.getByRole("button", { name: "strategy.stint.reset" }));
    expect((screen.getAllByLabelText("strategy.stint.driver")[0] as HTMLSelectElement).value).toBe("alex");
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);

    view.rerender(<StrategyRecordedStintEditor plan={plan} drivers={drivers} locked onDirtyChange={onDirtyChange} onRecalculate={vi.fn()} t={key => key} />);
    expect((screen.getByLabelText("strategy.stint.dragBoundary 1") as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "strategy.stint.recalculate" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
