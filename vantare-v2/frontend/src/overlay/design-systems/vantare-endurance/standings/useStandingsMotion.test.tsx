import { createRef } from "react";
import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type {
  StandingsRowViewModel,
  StandingsViewModel,
} from "../../../widget-types/standings/standings-view-model";
import { useStandingsMotion } from "./useStandingsMotion";

function row(partial: Partial<StandingsRowViewModel> & { id: string }): StandingsRowViewModel {
  return {
    position: 1,
    vehicleClass: "GT3",
    driverNumber: "51",
    driverName: "Driver",
    gapText: "+10.0",
    bestLapText: "1:38.000",
    lastLapText: "1:38.400",
    pitText: "",
    isPlayer: false,
    ...partial,
  } as StandingsRowViewModel;
}

/**
 * Two GT3 cars `interval` apart. The class leader's own gap is treated as zero
 * by the derivation, so the follower's gap IS the interval between them.
 */
function model(interval: number): StandingsViewModel {
  return {
    type: "standings",
    status: "ready",
    sessionLabel: "RACE",
    remainingText: "10:00",
    rows: [
      row({ id: "ahead", position: 1, gapText: "+0.0" }),
      row({ id: "behind", position: 2, gapText: `+${interval.toFixed(1)}` }),
    ],
  } as StandingsViewModel;
}

function renderMotion(initial: StandingsViewModel) {
  const rootRef = createRef<HTMLElement>();
  return renderHook(({ value }) => useStandingsMotion(value, true, rootRef), {
    initialProps: { value: initial },
  });
}

describe("battle teardown", () => {
  it("reports a pair while it is within the threshold", () => {
    const { result } = renderMotion(model(0.4));
    expect(result.current.battles).toHaveLength(1);
    expect(result.current.battles[0]?.stage).toBe("seam");
  });

  // The bug this guards: the pair used to be added to `dissolving` from a
  // scheduled callback, so the render that dropped it had no battle at all.
  // The template unwrapped the rows out of their container, React destroyed
  // that subtree, and every descendant animation restarted on the way back in.
  it("keeps the pair as dissolving in the very render that drops it", () => {
    const { result, rerender } = renderMotion(model(0.4));
    expect(result.current.battles).toHaveLength(1);

    rerender({ value: model(3) });

    expect(result.current.battles).toHaveLength(1);
    expect(result.current.battles[0]?.stage).toBe("dissolve");
  });

  it("carries the last interval into the dissolve, so the fill keeps its charge", () => {
    const { result, rerender } = renderMotion(model(0.4));
    rerender({ value: model(3) });
    expect(result.current.battles[0]?.intervalSeconds).toBeCloseTo(0.4, 5);
  });

  it("reports nothing once a pair that never battled drifts apart", () => {
    const { result, rerender } = renderMotion(model(3));
    expect(result.current.battles).toHaveLength(0);
    rerender({ value: model(4) });
    expect(result.current.battles).toHaveLength(0);
  });

  it("re-engaging the same pair reports it as active, not dissolving", () => {
    const { result, rerender } = renderMotion(model(0.4));
    rerender({ value: model(3) });
    expect(result.current.battles[0]?.stage).toBe("dissolve");

    rerender({ value: model(0.5) });
    expect(result.current.battles).toHaveLength(1);
    expect(result.current.battles[0]?.stage).not.toBe("dissolve");
  });
});
