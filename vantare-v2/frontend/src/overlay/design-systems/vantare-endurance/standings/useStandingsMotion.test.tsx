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
  motionIdentity = "session-a:1",
  motionSequence = 1,
): StandingsViewModel {
  return {
    type: "standings",
    status: "ready",
    sessionLabel,
    remainingText: "10:00",
    motionIdentity,
    motionSequence,
    columns: visibleMetrics.map(column),
    rows,
  } as StandingsViewModel;
}

describe("position delta authority", () => {
  it.each(["PRACTICE", "QUALIFYING", "WARMUP", "RACE"])(
    "does not invent a grid baseline in %s",
    (sessionLabel) => {
      const initial = modelWithRows([
        row({ id: "a", position: 1 }),
        row({ id: "b", position: 2 }),
      ], sessionLabel);
      const { result, rerender } = renderMotion(initial);

      rerender({ value: modelWithRows([
        row({ id: "b", position: 1 }),
        row({ id: "a", position: 2 }),
      ], sessionLabel, undefined, "session-a:1", 2) });

      expect(result.current.positionDeltas.size).toBe(0);
    },
  );

  it.each(["PRACTICE", "QUALIFYING"])(
    "clears a race delta when the session changes to %s",
    (sessionLabel) => {
      const { result, rerender } = renderMotion(modelWithRows([
        row({
          id: "a",
          position: 2,
          gridPosition: 3,
          gridSessionIdentity: "session-a:1",
        }),
      ]));
      expect(result.current.positionDeltas.get("a")).toBe(1);

      rerender({ value: modelWithRows([
        row({ id: "a", position: 2, gridPosition: 3 }),
      ], sessionLabel, undefined, "session-b:2", 1) });

      expect(result.current.positionDeltas.size).toBe(0);
    },
  );

  it.each([
    ["session id", "session-b:1"],
    ["epoch", "session-a:2"],
  ])("does not retain a delta after a %s reset", (_label, motionIdentity) => {
    const { result, rerender } = renderMotion(modelWithRows([
      row({
        id: "a",
        position: 2,
        gridPosition: 3,
        gridSessionIdentity: "session-a:1",
      }),
    ]));
    expect(result.current.positionDeltas.get("a")).toBe(1);

    rerender({ value: modelWithRows([
      row({ id: "a", position: 1 }),
    ], "RACE", undefined, motionIdentity, 1) });

    expect(result.current.positionDeltas.size).toBe(0);
  });

  it("does not treat the first late race frame as the starting grid", () => {
    const { result, rerender } = renderMotion(modelWithRows([
      row({ id: "a", position: 8 }),
      row({ id: "b", position: 9 }),
    ], "RACE", undefined, "late-race:7", 500));

    rerender({ value: modelWithRows([
      row({ id: "b", position: 8 }),
      row({ id: "a", position: 9 }),
    ], "RACE", undefined, "late-race:7", 501) });

    expect(result.current.positionDeltas.size).toBe(0);
  });
});

function renderMotion(initial: StandingsViewModel) {
  const rootRef = createRef<HTMLElement>();
  return renderHook(({ value }) => useStandingsMotion(value, true, rootRef), {
    initialProps: { value: initial },
  });
}

describe("battle teardown", () => {
  it.each([
    { reset: "session", sessionLabel: "RACE", identity: "session-b:1", sequence: 1 },
    { reset: "epoch", sessionLabel: "RACE", identity: "session-a:2", sequence: 1 },
    { reset: "mode", sessionLabel: "PRACTICE", identity: "session-a:1", sequence: 3 },
    { reset: "sequence", sessionLabel: "RACE", identity: "session-a:1", sequence: 1 },
  ])("clears imperative marks and animations on a $reset reset", ({ sessionLabel, identity, sequence }) => {
    vi.useFakeTimers();
    const root = document.createElement("div");
    root.innerHTML = [
      '<div data-standings-row="a"></div>',
      '<div data-standings-row="b"></div>',
    ].join("");
    const activeAnimation = { cancel: vi.fn() };
    for (const element of root.querySelectorAll<HTMLElement>("[data-standings-row]")) {
      Object.defineProperty(element, "animate", {
        configurable: true,
        value: vi.fn(() => activeAnimation),
      });
      Object.defineProperty(element, "getAnimations", {
        configurable: true,
        value: vi.fn(() => [activeAnimation]),
      });
    }
    const rootRef = createRef<HTMLElement>();
    rootRef.current = root;
    const initial = modelWithRows([
      row({ id: "a", position: 1, bestLapText: "1:40.000" }),
      row({ id: "b", position: 2, bestLapText: "1:41.000", isPlayer: true }),
    ]);
    const highlighted = modelWithRows([
      row({ id: "b", position: 1, bestLapText: "1:39.000", isPlayer: true }),
      row({ id: "a", position: 2, bestLapText: "1:40.000" }),
    ], "RACE", undefined, "session-a:1", 2);
    const hook = renderHook(({ value }) => useStandingsMotion(value, true, rootRef), {
      initialProps: { value: initial },
    });

    hook.rerender({ value: highlighted });
    const highlightedRow = root.querySelector<HTMLElement>('[data-standings-row="b"]')!;
    expect(highlightedRow.dataset.motion).toBe("rise");
    expect(highlightedRow.dataset.hot).toBe("true");
    expect(highlightedRow.style.getPropertyValue("--flash-delay")).toBe("0ms");

    hook.rerender({
      value: modelWithRows([...highlighted.rows], sessionLabel, undefined, identity, sequence),
    });

    expect(highlightedRow.dataset.motion).toBeUndefined();
    expect(highlightedRow.dataset.hot).toBeUndefined();
    expect(highlightedRow.style.getPropertyValue("--flash-delay")).toBe("");
    expect(activeAnimation.cancel).toHaveBeenCalled();
  });

  it("removes crown flight and cannot resurrect timed state after a mode reset", () => {
    vi.useFakeTimers();
    const root = document.createElement("div");
    root.innerHTML = '<div data-standings-row="player"></div>';
    const crown = document.createElement("div");
    crown.className = "ven-red-crown-fly";
    const crownAnimation = { cancel: vi.fn() };
    Object.defineProperty(crown, "getAnimations", {
      configurable: true,
      value: vi.fn(() => [crownAnimation]),
    });
    root.appendChild(crown);
    const rootRef = createRef<HTMLElement>();
    rootRef.current = root;
    const inPit = modelWithRows([
      row({ id: "player", pitText: "PIT", tireCompound: "M", isPlayer: true }),
    ]);
    const onTrack = modelWithRows([
      row({ id: "player", pitText: "", tireCompound: "S", isPlayer: true }),
    ], "RACE", undefined, "session-a:1", 2);
    const hook = renderHook(({ value }) => useStandingsMotion(value, true, rootRef), {
      initialProps: { value: inPit },
    });

    hook.rerender({ value: onTrack });
    hook.rerender({
      value: modelWithRows([...onTrack.rows], "PRACTICE", undefined, "session-a:1", 3),
    });
    act(() => vi.advanceTimersByTime(0));

    expect(hook.result.current.tires.size).toBe(0);
    act(() => vi.runAllTimers());

    expect(root.querySelector(".ven-red-crown-fly")).toBeNull();
    expect(crownAnimation.cancel).toHaveBeenCalledOnce();
    expect(hook.result.current.tires.size).toBe(0);
    expect(hook.result.current.positionDeltas.size).toBe(0);
    expect(hook.result.current.battles).toHaveLength(0);
    expect(hook.result.current.ghosts).toHaveLength(0);
  });

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
