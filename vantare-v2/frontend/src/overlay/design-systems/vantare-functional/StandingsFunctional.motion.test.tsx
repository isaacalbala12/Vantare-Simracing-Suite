import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StandingsRowViewModel, StandingsViewModel } from "../../widget-types/standings/standings-view-model";
import { StandingsFunctional } from "./StandingsFunctional";
import { deriveFunctionalStandingsEvents, selectStandingsBattle } from "./standings-motion";

function row(id: string, position: number, seconds = 100 + position): StandingsRowViewModel {
  return { id, position, classPosition: position, driverNumber: "", driverName: id, vehicleClass: "GT3", teamCode: "", teamBrandColor: "", gapText: "", intervalText: "", currentLapText: "3", lastLapText: "1:43.000", bestLapText: `1:${(seconds - 60).toFixed(3)}`, bestLapSeconds: seconds, pitText: "", tireCompound: "", isPlayer: id === "a", isLeader: position === 1 };
}
function model(rows: StandingsRowViewModel[], overrides: Partial<StandingsViewModel> = {}): StandingsViewModel {
  const best = [...rows].sort((a, b) => a.bestLapSeconds! - b.bestLapSeconds!)[0]!;
  return { type: "standings", status: "ready", sessionLabel: "RACE", activeClass: "GT3", remainingText: "10:00", classificationMode: "normal", motionIdentity: "session:1", motionSequence: 1,
    columns: ["position", "driverName", "bestLap", "pit"].map((metricId) => ({ id: metricId, metricId, enabled: true, widthPreset: "auto" })),
    rows, sessionBest: { rowId: best.id, seconds: best.bestLapSeconds! }, ...overrides };
}

const animate = vi.fn();
const animateDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "animate");
const animationsDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "getAnimations");
let running = new Map<HTMLElement, Animation[]>();
beforeEach(() => {
  vi.useFakeTimers();
  animate.mockReset();
  running = new Map();
  Object.defineProperty(HTMLElement.prototype, "animate", { configurable: true, value: function(this: HTMLElement, ...args: unknown[]) {
    animate(this, ...args);
    const started = Date.now();
    const duration = (args[1] as KeyframeAnimationOptions)?.duration as number ?? 200;
    const animation = { playState: "running", effect: {
      getKeyframes: () => args[0],
      getComputedTiming: () => ({ progress: Math.min(1, (Date.now() - started) / duration) }),
    }, cancel: vi.fn(() => {
      Object.assign(animation, { playState: "idle" });
      running.set(this, (running.get(this) ?? []).filter((item) => item !== animation));
    }) } as unknown as Animation;
    running.set(this, [...running.get(this) ?? [], animation]);
    return animation;
  } });
  Object.defineProperty(HTMLElement.prototype, "getAnimations", { configurable: true, value: function(this: HTMLElement, options?: { subtree?: boolean }) {
    return [...running].flatMap(([element, items]) => element === this || (options?.subtree && this.contains(element)) ? items : []);
  } });
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function(this: HTMLElement) {
    const top = this.hasAttribute("data-standings-row") ? [...this.parentElement!.children].indexOf(this) * 30
      : this.hasAttribute("data-pit-row") ? Number.parseFloat(this.style.top) : 0;
    return new DOMRect(0, top, 300, 300);
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  for (const [name, descriptor] of [["animate", animateDescriptor], ["getAnimations", animationsDescriptor]] as const) {
    if (descriptor) Object.defineProperty(HTMLElement.prototype, name, descriptor);
    else Reflect.deleteProperty(HTMLElement.prototype, name);
  }
});
const view = (value: StandingsViewModel, motion: "full" | "reduced" | "minimal" = "full") => <StandingsFunctional model={value} settings={{}} renderMode="harness" motion={motion} />;
const element = (id: string) => document.querySelector<HTMLElement>(`[data-standings-row="${id}"]`)!;

describe("Standings intermediate motion", () => {
  it("fades a changed window without making a crop into a position event", () => {
    const initial = model([row("a", 1), { ...row("b", 5), pitText: "PIT" }, row("c", 6)]);
    const { rerender } = render(view(initial));
    rerender(view(model([row("a", 1), row("c", 6), row("d", 7)])));
    expect(document.querySelectorAll("[data-standings-row]")).toHaveLength(3);
    const ghost = document.querySelector<HTMLElement>('[data-exiting-row="b"]')!;
    expect(ghost.getAttribute("aria-hidden")).toBe("true");
    expect(ghost.hasAttribute("inert")).toBe(true);
    expect(ghost.querySelector(".vf-pit-rail .vf-pit-label[data-pit-active]")).not.toBeNull();
    expect(ghost.querySelector("[data-standings-row], [data-pit-row], [data-pit-indicator]")).toBeNull();
    expect(document.querySelector("[data-motion]")).toBeNull();
    expect(animate.mock.calls.some(([target, frames]) => target === element("d") && frames[0].opacity === 0)).toBe(true);
    expect(animate.mock.calls.some(([target, frames]) => target === element("c") && frames[0].transform === "translateY(30px)")).toBe(true);
    act(() => vi.advanceTimersByTime(200));
    expect(document.querySelector("[data-exiting-row]")).toBeNull();
  });

  it("keeps one entry fade across ticks while FLIP retargets the entering row", () => {
    const { rerender } = render(view(model([row("a", 1)])));
    rerender(view(model([row("a", 1), row("b", 2)])));
    const b = element("b");
    const fade = running.get(b)![0]!;
    act(() => vi.advanceTimersByTime(50));
    rerender(view(model([row("a", 1), row("b", 2)])));
    expect(fade.cancel).not.toHaveBeenCalled();
    rerender(view(model([row("b", 1), row("a", 2)])));
    expect(fade.cancel).not.toHaveBeenCalled();
    expect(animate.mock.calls.filter(([target, frames]) => target === b && frames[0].opacity === 0)).toHaveLength(1);
    expect(animate.mock.calls.some(([target, frames]) => target === b && frames[0].transform === "translateY(30px)")).toBe(true);
    act(() => vi.advanceTimersByTime(150));
    expect(fade.cancel).toHaveBeenCalled();
  });

  it("continues partial opacity through entry, quick exit and re-entry", () => {
    const { rerender } = render(view(model([row("a", 1)])));
    rerender(view(model([row("a", 1), row("b", 2)])));
    act(() => vi.advanceTimersByTime(100));
    rerender(view(model([row("a", 1)])));
    const ghost = document.querySelector<HTMLElement>('[data-exiting-row="b"]')!;
    expect(animate.mock.calls.find(([target]) => target === ghost)?.[1][0].opacity).toBe(0.5);
    act(() => vi.advanceTimersByTime(100));
    rerender(view(model([row("a", 1), row("b", 2)])));
    expect(document.querySelector("[data-exiting-row]")).toBeNull();
    expect(animate.mock.calls.findLast(([target, frames]) => target === element("b") && "opacity" in frames[0])?.[1][0].opacity).toBe(0.25);
    act(() => vi.advanceTimersByTime(100));
    expect(element("b").isConnected).toBe(true);
    expect(running.get(element("b"))?.some((animation) => animation.playState === "running")).toBe(true);
  });

  it.each([0.5, 2])("positions outgoing row/PIT at the current FLIP location under scale %s", (scale) => {
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(300);
    vi.mocked(HTMLElement.prototype.getBoundingClientRect).mockImplementation(function(this: HTMLElement) {
      const top = this.hasAttribute("data-standings-row") ? [...this.parentElement!.children].indexOf(this) * 30
        : this.hasAttribute("data-pit-row") ? Number.parseFloat(this.style.top) : 0;
      return new DOMRect(0, top * scale, 300 * scale, 300 * scale);
    });
    const { rerender } = render(view(model([row("a", 1), { ...row("b", 2), pitText: "PIT" }])));
    rerender(view(model([{ ...row("b", 1), pitText: "PIT" }, row("a", 2)])));
    act(() => vi.advanceTimersByTime(100));
    rerender(view(model([row("a", 2)])));
    const ghost = document.querySelector<HTMLElement>('[data-exiting-row="b"]')!;
    expect(Number.parseFloat(ghost.style.top)).toBeCloseTo(30 * (1 - 100 / 313));
    expect(ghost.style.width).toBe("300px");
    expect(ghost.querySelector<HTMLElement>(".vf-pit-row")!.style.top).toBe("0px");
  });

  it.each(["stale", "disconnected", "error", "epoch", "reduced", "minimal", "unmount"])("cleans exiting snapshots and entry fades on %s", (stop) => {
    const { rerender, unmount } = render(view(model([row("a", 1), row("b", 2)])));
    const next = model([row("a", 1), row("c", 3)]);
    rerender(view(next));
    const active = [...running.values()].flat();
    expect(document.querySelector("[data-exiting-row]")).not.toBeNull();
    if (stop === "unmount") unmount();
    else if (stop === "reduced" || stop === "minimal") rerender(view(next, stop));
    else if (stop === "epoch") rerender(view({ ...next, motionIdentity: "new" }));
    else rerender(view({ ...next, status: stop as "stale" | "disconnected" | "error" }));
    expect(document.querySelector("[data-exiting-row]")).toBeNull();
    expect(active.every((animation) => vi.mocked(animation.cancel).mock.calls.length > 0)).toBe(true);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["reduced", "minimal"] as const)("updates presence immediately with %s motion", (motion) => {
    const { rerender } = render(view(model([row("a", 1), row("b", 2)]), motion));
    rerender(view(model([row("b", 2), row("c", 3)]), motion));
    expect(document.querySelector("[data-exiting-row]")).toBeNull();
    expect(animate.mock.calls.some(([, frames]) => "opacity" in frames[0])).toBe(false);
    expect(animate.mock.calls.some(([, frames]) => "transform" in frames[0])).toBe(motion === "reduced");
  });

  it("animates the first reorder and keeps PIT on the same trajectory", () => {
    const before = model([{ ...row("a", 1), pitText: "PIT" }, row("b", 2)]);
    const { rerender } = render(view(before));
    expect(animate).not.toHaveBeenCalled();
    const pit = document.querySelector('[data-pit-row="a"]')!;
    rerender(view(model([row("b", 1), { ...row("a", 2), pitText: "PIT" }])));
    const movement = animate.mock.calls.filter(([target]) => target === element("a") || target === pit);
    expect(movement).toHaveLength(2);
    expect(movement[0]![1]).toEqual(movement[1]![1]);
    expect(element("a").querySelector("[data-position-change]")?.textContent).toBe("−1");
    expect(element("b").querySelector("[data-position-change]")?.textContent).toBe("+1");
    expect(document.querySelector('[data-pit-row="a"]')).toBe(pit);
  });

  it("sweeps an improved lap, transfers the record and keeps numbers stable", () => {
    const { rerender } = render(view(model([row("a", 1, 100), row("b", 2, 101)])));
    rerender(view(model([row("a", 1, 100), row("b", 2, 100.5)])));
    expect(element("b").dataset.lapEvent).toBe("personal");
    rerender(view(model([row("a", 1, 100), row("b", 2, 99.5)])));
    expect(element("b").dataset.lapEvent).toBe("session");
    expect(element("b").dataset.sessionBest).toBe("true");
    expect(element("a").hasAttribute("data-session-best")).toBe(false);
    expect(animate.mock.calls.every(([target]) => target.classList.contains("vf-lap-sweep"))).toBe(true);
    expect(element("b").querySelector<HTMLElement>(".vf-cell-value")?.style.transform).toBe("");
    act(() => vi.advanceTimersByTime(1200));
    expect(element("b").dataset.lapEvent).toBeUndefined();
    expect(element("b").dataset.sessionBest).toBe("true");
  });

  it("keeps a PIT node for its exit and preserves immediate accessible status", () => {
    const { rerender } = render(view(model([{ ...row("a", 1), pitText: "PIT" }])));
    const badge = document.querySelector("[data-pit-indicator]")!;
    rerender(view(model([row("a", 1)])));
    expect(badge.isConnected).toBe(true);
    expect(badge.getAttribute("aria-hidden")).toBe("true");
    expect(document.querySelector("[data-pit-indicator]")).toBeNull();
  });

  it("cleans notices when the budget changes even with the same telemetry object", () => {
    const before = model([row("a", 1), row("b", 2)]);
    const after = model([row("b", 1), row("a", 2)]);
    const { rerender, unmount } = render(view(before));
    rerender(view(after));
    expect(document.querySelector("[data-notice-priority]")).not.toBeNull();
    rerender(view(after, "reduced"));
    expect(document.querySelector("[data-notice-priority]")).toBeNull();
    rerender(view(after, "minimal"));
    expect([...running.values()].flat()).toHaveLength(0);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cancels in-flight row animations before unmount detaches the root", () => {
    const { rerender, unmount } = render(view(model([row("a", 1), row("b", 2)])));
    rerender(view(model([row("b", 1), row("a", 2)])));
    const active = [...running.values()].flat();
    expect(active.length).toBeGreaterThan(0);
    unmount();
    expect(active.every((animation) => vi.mocked(animation.cancel).mock.calls.length > 0)).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["disconnected", "error"] as const)("cancels removed rows and lap effects when the mounted widget becomes %s", (status) => {
    const { rerender } = render(view(model([row("a", 1, 100), row("b", 2, 101)])));
    const changed = model([row("b", 1, 99), row("a", 2, 100)]);
    rerender(view(changed));
    const active = [...running.values()].flat();
    expect(active.length).toBeGreaterThan(0);
    rerender(view({ ...changed, status }));
    expect(document.querySelector(".vf-standings")).not.toBeNull();
    expect(document.querySelector("[data-standings-row]")).toBeNull();
    expect(active.every((animation) => vi.mocked(animation.cancel).mock.calls.length > 0)).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cancels animations on a pilot that leaves the visible window", () => {
    const { rerender } = render(view(model([row("a", 1, 100), row("b", 2, 101)])));
    rerender(view(model([row("b", 1, 99), row("a", 2, 100)])));
    const removed = [element("b"), document.querySelector<HTMLElement>('[data-pit-row="b"]')!, element("b").querySelector<HTMLElement>(".vf-lap-sweep")!];
    const active = removed.flatMap((node) => running.get(node) ?? []);
    expect(active).toHaveLength(3);
    rerender(view(model([row("a", 2, 100)])));
    expect(removed.every((node) => !node.isConnected)).toBe(true);
    expect(active.every((animation) => vi.mocked(animation.cancel).mock.calls.length > 0)).toBe(true);
  });

  it("cancels on stale and treats a new epoch as a fresh baseline", () => {
    const { rerender } = render(view(model([row("a", 1, 100), row("b", 2, 101)])));
    const changed = model([row("a", 1, 100), row("b", 2, 99)]);
    rerender(view(changed));
    rerender(view({ ...changed, status: "stale" }));
    expect(document.querySelector("[data-lap-event]")).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
    rerender(view({ ...changed, motionIdentity: "session:2" }));
    expect(document.querySelector("[data-lap-event]")).toBeNull();
  });

  it("limits notices to three and prioritizes a new session record", () => {
    const rows = [row("a", 1, 90), row("b", 2), row("c", 3), row("d", 4), row("e", 5)];
    const { rerender } = render(view(model(rows)));
    const improved = rows.map((r, i) => i ? { ...r, bestLapSeconds: r.bestLapSeconds! - 0.1 } : r);
    rerender(view(model(improved)));
    expect(document.querySelectorAll("[data-notice-priority]")).toHaveLength(3);
    rerender(view(model(improved.map((r) => r.id === "e" ? { ...r, bestLapSeconds: 89 } : r))));
    expect(document.querySelectorAll("[data-notice-priority]")).toHaveLength(3);
    expect(element("e").dataset.lapEvent).toBe("session");
  });

  it("does not spend an active notice slot on an outgoing snapshot", () => {
    const rows = [row("a", 1, 90), row("b", 2), row("c", 3), row("d", 4), row("e", 5)];
    const { rerender } = render(view(model(rows)));
    const improved = rows.map((r) => ["b", "c", "d"].includes(r.id) ? { ...r, bestLapSeconds: r.bestLapSeconds! - 0.1 } : r);
    rerender(view(model(improved)));
    expect(document.querySelectorAll("[data-standings-row][data-notice-priority]")).toHaveLength(3);
    rerender(view(model(improved.filter((r) => r.id !== "b").map((r) => r.id === "e" ? { ...r, bestLapSeconds: r.bestLapSeconds! - 0.1 } : r))));
    expect(document.querySelector('[data-exiting-row="b"] [data-notice-priority]')).not.toBeNull();
    expect(document.querySelectorAll("[data-standings-row][data-notice-priority]")).toHaveLength(3);
    expect(element("e").dataset.lapEvent).toBe("personal");
  });

  it("does not let an old timer clear a newer notice on the same pilot", () => {
    const { rerender } = render(view(model([row("a", 1, 100), row("b", 2, 101)])));
    rerender(view(model([row("a", 1, 100), row("b", 2, 100.5)])));
    act(() => vi.advanceTimersByTime(600));
    rerender(view(model([row("a", 1, 100), row("b", 2, 99.5)])));
    act(() => vi.advanceTimersByTime(650));
    expect(element("b").dataset.lapEvent).toBe("session");
    act(() => vi.advanceTimersByTime(550));
    expect(element("b").dataset.lapEvent).toBeUndefined();
  });
});

describe("Standings event authority", () => {
  const battleRow = (id: string, position: number, gap: number) => ({ ...row(id, position), battleGapSeconds: gap });
  const visible = new Set(["a", "b", "c", "d"]);
  it("enters a duel at 0.8s, retains it at 1.2s and gives a new player duel priority", () => {
    const at = (gap: number) => model([battleRow("a", 1, 0), battleRow("b", 2, gap)]);
    expect(selectStandingsBattle(at(0.81), visible)).toBeUndefined();
    const duel = selectStandingsBattle(at(0.8), visible)!;
    expect(duel).toMatchObject({ aheadId: "a", behindId: "b", player: true });
    expect(selectStandingsBattle(at(1.2), visible, duel)).toBeDefined();
    expect(selectStandingsBattle(at(1.21), visible, duel)).toBeUndefined();
    const rivals = model([battleRow("c", 1, 0), battleRow("d", 2, 0.3)]);
    const previous = selectStandingsBattle(rivals, visible);
    const playerDuel = model([...rivals.rows, battleRow("a", 3, 5), battleRow("b", 4, 5.7)]);
    expect(selectStandingsBattle(playerDuel, visible, previous)).toMatchObject({ aheadId: "a", behindId: "b" });
  });

  it("keeps an established pair instead of flickering to a slightly closer rival", () => {
    const initial = model([battleRow("c", 1, 0), battleRow("d", 2, 0.6)]);
    const previous = selectStandingsBattle(initial, visible);
    const next = model([...initial.rows, { ...battleRow("a", 3, 3), isPlayer: false }, battleRow("b", 4, 3.4)]);
    expect(selectStandingsBattle(next, visible, previous)).toMatchObject({ aheadId: "c", behindId: "d" });
  });

  it("rejects unknown/mixed classes, non-consecutive crop, invalid gap and pit data", () => {
    const a = battleRow("a", 1, 0);
    const b = battleRow("b", 2, 0.4);
    for (const patch of [{ vehicleClass: "" }, { vehicleClass: "LMP2" }, { classPosition: 7 }, { position: 0 }, { battleGapSeconds: undefined }, { battleGapSeconds: -0.1 }, { battleGapSeconds: NaN }, { pitText: "PIT" }]) {
      expect(selectStandingsBattle(model([a, { ...b, ...patch }]), visible)).toBeUndefined();
    }
    expect(selectStandingsBattle(model([a, b]), new Set(["a"]))).toBeUndefined();
    expect(selectStandingsBattle(model([a, b], { sessionLabel: "QUALIFYING" }), visible)).toBeUndefined();
    expect(selectStandingsBattle(model([a, b], { status: "stale" }), visible)).toBeUndefined();
  });

  it("selects a visible duel after physical height cropping and resets hysteresis on a new source", () => {
    const rows = [battleRow("c", 1, 0), battleRow("d", 2, 0.5), battleRow("a", 3, 5), battleRow("b", 4, 5.4)];
    const layout = { x: 0, y: 0, w: 400, h: 98 };
    const at = (value: StandingsViewModel) => <StandingsFunctional model={value} settings={{ showSessionHeader: false, showSessionFooter: false, brandVisible: false }} layout={layout} renderMode="harness" motion="full" />;
    const { rerender } = render(at(model(rows)));
    rerender(at(model(rows)));
    expect([...document.querySelectorAll("[data-battle]")].map((node) => node.getAttribute("data-standings-row"))).toEqual(["c", "d"]);
    const separated = model(rows.map((r) => r.id === "d" ? { ...r, battleGapSeconds: 1 } : r));
    rerender(at(separated));
    expect(document.querySelectorAll("[data-battle]")).toHaveLength(2);
    rerender(at({ ...separated, motionIdentity: "new" }));
    rerender(at({ ...separated, motionIdentity: "new" }));
    expect(document.querySelectorAll("[data-battle]")).toHaveLength(0);
  });

  it("does not mistake a different window for an overtake or lap record", () => {
    const before = model([row("a", 1), row("b", 5), row("c", 6)]);
    const after = model([row("a", 1), row("d", 4), row("b", 5)]);
    expect(deriveFunctionalStandingsEvents(before, after)).toEqual([]);
  });
  it("shows the position change when a simultaneous record has its column hidden", () => {
    const before = model([row("a", 1, 100), row("b", 2, 101)]);
    const after = model([row("b", 1, 99), row("a", 2, 100)]);
    after.columns = after.columns.filter((column) => column.metricId !== "bestLap");
    expect(deriveFunctionalStandingsEvents(before, after)).toContainEqual({ rowId: "b", kind: "position", places: 1 });
  });

  it("uses class positions only in multiclass", () => {
    const a = row("a", 4);
    const b = { ...a, position: 3 };
    expect(deriveFunctionalStandingsEvents(model([a]), model([b]))[0]?.places).toBe(1);
    expect(deriveFunctionalStandingsEvents(model([a], { classificationMode: "multiclass" }), model([b], { classificationMode: "multiclass" }))).toEqual([]);
  });
  it.each([{ motionIdentity: "new" }, { motionSequence: 0 }, { sessionLabel: "PRACTICE" }, { status: "stale" as const }])("ignores a break in continuity: %j", (patch) => {
    expect(deriveFunctionalStandingsEvents(model([row("a", 1, 100)]), model([row("a", 1, 99)], patch))).toEqual([]);
  });
  it("does not animate missing, stale or non-finite lap authority", () => {
    for (const bestLapSeconds of [undefined, Number.NaN, 0]) {
      expect(deriveFunctionalStandingsEvents(model([{ ...row("a", 1), bestLapSeconds }]), model([row("a", 1, 99)]))).toEqual([]);
    }
  });
});
