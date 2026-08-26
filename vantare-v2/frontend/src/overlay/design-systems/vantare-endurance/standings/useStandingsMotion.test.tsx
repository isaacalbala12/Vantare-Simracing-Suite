import { createRef } from "react";
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WidgetColumnV3 } from "../../../widget-types/shared/widget-column";
import type {
  StandingsRowViewModel,
  StandingsViewModel,
} from "../../../widget-types/standings/standings-view-model";
import { useStandingsMotion } from "./useStandingsMotion";

afterEach(() => vi.useRealTimers());

function column(metricId: string): WidgetColumnV3 {
  return { id: metricId, metricId, enabled: true, widthPreset: "md" };
}

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
  return modelWithRows([
    row({ id: "ahead", position: 1, gapText: "+0.0" }),
    row({
      id: "behind",
      position: 2,
      gapText: `+${interval.toFixed(1)}`,
      isPlayer: true,
    }),
  ]);
}

function modelWithRows(
  rows: StandingsRowViewModel[],
  sessionLabel = "RACE",
  visibleMetrics: readonly string[] = ["gap", "bestLap", "tireCompound", "pit"],
): StandingsViewModel {
  return {
    type: "standings",
    status: "ready",
    sessionLabel,
    remainingText: "10:00",
    columns: visibleMetrics.map(column),
    rows,
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

  it("drops a race battle immediately when the session changes to qualifying", () => {
    const rows = [
      row({ id: "ahead", position: 1, gapText: "+0.0" }),
      row({ id: "player", position: 2, gapText: "+0.4", isPlayer: true }),
    ];
    const { result, rerender } = renderMotion(modelWithRows(rows));
    expect(result.current.battles).toHaveLength(1);

    rerender({ value: modelWithRows(rows, "QUALIFYING") });

    expect(result.current.battles).toHaveLength(0);
  });

  it("dissolves the freshest pair after rapid battle changes", () => {
    const battleAhead = modelWithRows([
      row({ id: "ahead", position: 1, gapText: "+0.0" }),
      row({ id: "player", position: 2, gapText: "+0.4", isPlayer: true }),
      row({ id: "behind", position: 3, gapText: "+2.0" }),
    ]);
    const battleBehind = modelWithRows([
      row({ id: "ahead", position: 1, gapText: "+0.0" }),
      row({ id: "player", position: 2, gapText: "+2.0", isPlayer: true }),
      row({ id: "behind", position: 3, gapText: "+2.4" }),
    ]);
    const noBattle = modelWithRows([
      row({ id: "ahead", position: 1, gapText: "+0.0" }),
      row({ id: "player", position: 2, gapText: "+2.0", isPlayer: true }),
      row({ id: "behind", position: 3, gapText: "+4.0" }),
    ]);
    const { result, rerender } = renderMotion(battleAhead);

    rerender({ value: battleBehind });
    rerender({ value: battleAhead });
    rerender({ value: noBattle });

    expect(result.current.battles).toHaveLength(1);
    expect(result.current.battles[0]).toMatchObject({
      aheadId: "ahead",
      behindId: "player",
      stage: "dissolve",
    });
  });

  it("never reports a dissolving battle alongside a newly selected closer battle", () => {
    const { result, rerender } = renderMotion(
      modelWithRows([
        row({ id: "ahead", position: 1, gapText: "+0.0" }),
        row({ id: "player", position: 2, gapText: "+0.4", isPlayer: true }),
        row({ id: "behind", position: 3, gapText: "+2.0" }),
      ]),
    );
    expect(result.current.battles).toHaveLength(1);
    expect(result.current.battles[0]?.aheadId).toBe("ahead");

    rerender({
      value: modelWithRows([
        row({ id: "ahead", position: 1, gapText: "+0.0" }),
        row({ id: "player", position: 2, gapText: "+2.0", isPlayer: true }),
        row({ id: "behind", position: 3, gapText: "+2.4" }),
      ]),
    });

    expect(result.current.battles).toHaveLength(1);
    expect(result.current.battles[0]?.aheadId).toBe("player");
    expect(result.current.battles[0]?.stage).not.toBe("dissolve");
  });

  it("does not report battle state when Gap is hidden, even if Interval is visible", () => {
    const rows = [
      row({ id: "ahead", position: 1, gapText: "+0.0" }),
      row({ id: "player", position: 2, gapText: "+0.4", intervalText: "+0.4", isPlayer: true }),
    ];

    const { result } = renderMotion(modelWithRows(rows, "RACE", ["interval"]));

    expect(result.current.battles).toHaveLength(0);
  });

  it("does not heat the row for a session best when Best lap is hidden", () => {
    vi.useFakeTimers();
    const root = document.createElement("div");
    root.innerHTML = '<div data-standings-row="a"></div><div data-standings-row="b"></div>';
    const rootRef = createRef<HTMLElement>();
    rootRef.current = root;
    const prev = modelWithRows([
      row({ id: "a", bestLapText: "1:40.000" }),
      row({ id: "b", position: 2, bestLapText: "1:41.000", isPlayer: true }),
    ], "RACE", ["gap"]);
    const next = modelWithRows([
      row({ id: "a", bestLapText: "1:40.000" }),
      row({ id: "b", position: 2, bestLapText: "1:39.000", isPlayer: true }),
    ], "RACE", ["gap"]);
    const hook = renderHook(({ value }) => useStandingsMotion(value, true, rootRef), {
      initialProps: { value: prev },
    });

    hook.rerender({ value: next });

    expect(root.querySelector<HTMLElement>('[data-standings-row="b"]')?.dataset.hot).toBeUndefined();
  });

  it("does not reveal a changed tire when Tire compound is hidden", () => {
    vi.useFakeTimers();
    const rootRef = createRef<HTMLElement>();
    rootRef.current = document.createElement("div");
    const prev = modelWithRows([
      row({ id: "player", pitText: "PIT", tireCompound: "M", isPlayer: true }),
    ], "RACE", ["gap"]);
    const next = modelWithRows([
      row({ id: "player", pitText: "", tireCompound: "S", isPlayer: true }),
    ], "RACE", ["gap"]);
    const hook = renderHook(({ value }) => useStandingsMotion(value, true, rootRef), {
      initialProps: { value: prev },
    });

    hook.rerender({ value: next });
    act(() => vi.advanceTimersByTime(0));

    expect(hook.result.current.tires.size).toBe(0);
  });
});
