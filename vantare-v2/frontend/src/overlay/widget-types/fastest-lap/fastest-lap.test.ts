import { afterEach, describe, expect, it, vi } from "vitest";
import { buildAuthoringV2ScenarioRuntime } from "../../authoring/fixtures/authoring-v2-scenario-fixture";
import type { OverlayFrameV2, OverlaySourceStatusV2 } from "../../../generated/telemetry";
import { fastestLapDefinition } from "./fastest-lap-definition";
import { buildFastestLapViewModelV2 } from "./fastest-lap-view-model";
import { createFastestLapStore } from "./fastest-lap-store";

const runtime = buildAuthoringV2ScenarioRuntime({
  widget: "fastest-lap", system: "vantare-functional", state: "ready",
  session: "race", location: "track", variant: "default",
});
const seed = runtime.overlayV2Frame!;
const live: OverlaySourceStatusV2 = runtime.overlayV2Source!;
const content = fastestLapDefinition.parseContent(null);
function frame(sequence = 1, best = 90): OverlayFrameV2 {
  const sample = seed.standings[0];
  return {
    ...seed, sequence, sessionId: "race-1", epoch: 1, player: { ...seed.player, id: "player" },
    standings: [
      { ...sample, id: "player", driver: "Isaac", classId: "GT3", laps: 4, bestLap: { q: "fresh", v: best }, lastLap: { q: "fresh", v: best } },
      { ...sample, id: "rival", driver: "Ana", classId: "GT3", laps: 4, bestLap: { q: "fresh", v: 91 }, lastLap: { q: "fresh", v: 91 } },
      { ...sample, id: "hypercar", driver: "Alex", classId: "HYPERCAR", laps: 4, bestLap: { q: "fresh", v: 80 }, lastLap: { q: "fresh", v: 80 } },
    ],
  };
}
function model(sequence = 1, best = 90) {
  return buildFastestLapViewModelV2(frame(sequence, best), live, content);
}
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

describe("fastest lap input", () => {
  it("enables personal and player-class records, never the overall field", () => {
    expect(content).toMatchObject({ showPersonal: true, showClass: true });
    expect(model().candidate?.id).toBe("player");
    expect(model().personal?.id).toBe("player");
    expect(model().rows.map(row => row.id)).toEqual(["player", "rival"]);
    expect(fastestLapDefinition.parseContent({ scope: "session" })).toEqual(content);
    expect(fastestLapDefinition.inspector?.content?.some(control => control.id === "scope")).toBe(false);
  });
  it("can still show a personal best without a known class", () => {
    const current = frame();
    const value = buildFastestLapViewModelV2({ ...current, standings: current.standings.map(row => ({ ...row, classId: undefined })) }, live, content);
    expect(value.status).toBe("ready");
    expect(value.personal?.id).toBe("player");
    expect(value.candidate).toBeUndefined();
  });
  it("does not fall back to the overall record when player class is unknown", () => {
    const current = frame();
    const value = buildFastestLapViewModelV2({ ...current, player: { ...current.player, id: "unknown" } }, live, content);
    expect(value.status).toBe("missing");
    expect(value.candidate).toBeUndefined();
  });
  it.each([NaN, Infinity, -1, 0])("rejects invalid timing %s", best => {
    const value = buildFastestLapViewModelV2(frame(1, best), live, content);
    expect(value.candidate?.id).toBe("rival");
  });
  it("ignores stale best-lap values", () => {
    const current = frame();
    const value = buildFastestLapViewModelV2({ ...current, standings: current.standings.map(row => ({ ...row, bestLap: { ...row.bestLap, q: "stale" } })) }, live, content);
    expect(value.candidate).toBeUndefined();
  });
  it.each([{ scope: "player" }, { durationSeconds: 0 }, { durationSeconds: 16 }, { durationSeconds: 3.5 }, { durationSeconds: NaN }, { showDriver: "yes" }, { showPersonal: "yes" }, { showClass: 1 }])("rejects unsupported settings %j", input => {
    expect(() => fastestLapDefinition.parseContent(input)).toThrow();
  });
});

describe("fastest lap notices", () => {
  it("silently establishes the record, then announces an improvement and expires without another frame", () => {
    vi.useFakeTimers();
    const store = createFastestLapStore();
    store.accept(model());
    expect(store.getSnapshot()).toBeNull();
    store.accept(model(2, 89));
    expect(store.getSnapshot()?.timing).toMatchObject({ driver: "Isaac", bestMs: 89000 });
    vi.advanceTimersByTime(5999);
    expect(store.getSnapshot()).not.toBeNull();
    vi.advanceTimersByTime(1);
    expect(store.getSnapshot()).toBeNull();
    store.accept(model(3, 89));
    expect(store.getSnapshot()).toBeNull();
  });
  it("announces a personal improvement that does not beat the class, then gives class priority when both improve", () => {
    const store = createFastestLapStore();
    store.accept(model(1, 92));
    store.accept(model(2, 91.5));
    expect(store.getSnapshot()).toMatchObject({ kind: "personal", timing: { id: "player", bestMs: 91500 } });
    const firstId = store.getSnapshot()!.id;
    store.accept(model(3, 90.5));
    expect(store.getSnapshot()).toMatchObject({ kind: "class", timing: { id: "player", bestMs: 90500 } });
    expect(store.getSnapshot()!.id).toBeGreaterThan(firstId);
    store.reset();
  });
  it.each([
    [true, false, "personal"], [false, true, "class"], [false, false, undefined],
  ] as const)("respects personal=%s and class=%s", (showPersonal, showClass, kind) => {
    const store = createFastestLapStore();
    const settings = { ...content, showPersonal, showClass };
    store.accept(buildFastestLapViewModelV2(frame(1, 92), live, settings));
    store.accept(buildFastestLapViewModelV2(frame(2, 90), live, settings));
    expect(store.getSnapshot()?.kind).toBe(kind);
    store.reset();
  });
  it("announces a rival's class improvement, ignoring other classes", () => {
    const store = createFastestLapStore();
    store.accept(model());
    const update = (sequence: number, rival: number) => {
      const current = frame(sequence);
      return buildFastestLapViewModelV2({ ...current, standings: current.standings.map(row => ({ ...row,
        bestLap: { q: "fresh", v: row.id === "rival" ? rival : row.id === "hypercar" ? 70 : 90 },
      })) }, live, content);
    };
    store.accept(update(2, 91));
    expect(store.getSnapshot()).toBeNull();
    store.accept(update(3, 89));
    expect(store.getSnapshot()).toMatchObject({ kind: "class", timing: { id: "rival" } });
    store.reset();
  });
  it("starts the exit before expiry and replaces an exiting notice without an old timer hiding it", () => {
    vi.useFakeTimers();
    const store = createFastestLapStore();
    store.accept(model());
    store.accept(model(2, 89));
    vi.advanceTimersByTime(5780);
    expect(store.getSnapshot()?.phase).toBe("leaving");
    store.accept(model(3, 88));
    expect(store.getSnapshot()?.phase).toBe("visible");
    vi.advanceTimersByTime(220);
    expect(store.getSnapshot()?.timing.bestMs).toBe(88000);
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(5780);
    expect(store.getSnapshot()).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("ignores equal millisecond times, duplicates and out-of-order snapshots", () => {
    const store = createFastestLapStore();
    store.accept(model(3, 90));
    store.accept(model(4, 89.9999));
    store.accept(model(4, 88));
    store.accept(model(2, 87));
    expect(store.getSnapshot()).toBeNull();
  });
  it("does not treat the arrival of a car with an old record as a new lap", () => {
    const store = createFastestLapStore();
    store.accept(model());
    const current = frame(2);
    const joined = { ...current.standings[0], id: "new", driver: "Newcomer", bestLap: { q: "fresh" as const, v: 88 } };
    store.accept(buildFastestLapViewModelV2({ ...current, standings: [...current.standings, joined] }, live, content));
    expect(store.getSnapshot()).toBeNull();
    store.accept(model(3, 89));
    expect(store.getSnapshot()?.kind).toBe("personal");
    store.reset();
  });
  it("does not lower its class reference when the record holder disappears", () => {
    const classOnly = { ...content, showPersonal: false };
    const store = createFastestLapStore();
    const initial = frame(1, 92);
    store.accept(buildFastestLapViewModelV2(initial, live, classOnly));
    const withoutRival = (sequence: number, best: number) => {
      const current = frame(sequence, best);
      return buildFastestLapViewModelV2({ ...current, standings: current.standings.filter(row => row.id !== "rival") }, live, classOnly);
    };
    store.accept(withoutRival(2, 92));
    store.accept(withoutRival(3, 91.5));
    expect(store.getSnapshot()).toBeNull();
    store.accept(withoutRival(4, 90.5));
    expect(store.getSnapshot()?.timing.bestMs).toBe(90500);
    store.reset();
  });
  it("establishes a fresh baseline after a reconnect even if no offline frame arrived", () => {
    const store = createFastestLapStore();
    store.accept(model());
    const reconnected = { ...live, retry: (live.retry ?? 0) + 1 };
    store.accept(buildFastestLapViewModelV2(frame(2, 88), reconnected, content));
    expect(store.getSnapshot()).toBeNull();
    store.accept(buildFastestLapViewModelV2(frame(3, 87), reconnected, content));
    expect(store.getSnapshot()?.timing.bestMs).toBe(87000);
    store.reset();
  });
  it("does not attribute an inherited record to a new driver in the same car", () => {
    const store = createFastestLapStore();
    store.accept(model());
    const swapped = (sequence: number, best: number) => {
      const current = frame(sequence, best);
      return buildFastestLapViewModelV2({ ...current, standings: current.standings.map(row =>
        row.id === "player" ? { ...row, driver: "Second driver" } : row) }, live, content);
    };
    store.accept(swapped(2, 88));
    expect(store.getSnapshot()).toBeNull();
    store.accept(swapped(3, 87));
    expect(store.getSnapshot()?.timing).toMatchObject({ driver: "Second driver", bestMs: 87000 });
    store.reset();
  });
  it("recognizes the first completed lap only when the lap count and last lap corroborate it", () => {
    const store = createFastestLapStore();
    const start = frame();
    const empty = { ...start, standings: start.standings.map(row => ({ ...row, laps: 0, bestLap: { q: "missing" as const }, lastLap: { q: "missing" as const } })) };
    store.accept(buildFastestLapViewModelV2(empty, live, content));
    store.accept(model(2, 90));
    expect(store.getSnapshot()?.timing.bestMs).toBe(90000);
  });
  it.each(["stale", "disconnected", "error"] as const)("clears on %s and does not replay a record on reconnect", status => {
    vi.useFakeTimers();
    const store = createFastestLapStore();
    store.accept(model());
    store.accept(model(2, 89));
    store.accept({ ...model(3, 88), status });
    expect(store.getSnapshot()).toBeNull();
    store.accept(model(4, 88));
    expect(store.getSnapshot()).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("resets at a session, epoch or scope change", () => {
    const store = createFastestLapStore();
    store.accept(model());
    store.accept(model(2, 89));
    store.accept({ ...model(3, 88), scopeKey: "new-session" });
    expect(store.getSnapshot()).toBeNull();
    store.reset();
  });
  it("replaces an active notice and restarts its deadline without accumulating timers", () => {
    vi.useFakeTimers();
    const store = createFastestLapStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    store.accept(model());
    store.accept(model(2, 89));
    vi.advanceTimersByTime(5000);
    store.accept(model(3, 88));
    vi.advanceTimersByTime(1000);
    expect(store.getSnapshot()?.timing.bestMs).toBe(88000);
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(5000);
    expect(store.getSnapshot()).toBeNull();
    expect(listener).toHaveBeenCalledTimes(4);
    unsubscribe();
    store.reset();
  });
});
