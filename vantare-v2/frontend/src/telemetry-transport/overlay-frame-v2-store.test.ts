import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { OverlayUpdateV2 } from "../generated/telemetry";
import {
  attachOverlayFrameV2Sse,
  attachOverlayFrameV2Transport,
  createOverlayFrameV2Store,
  decodeOverlayUpdateV2,
  OVERLAY_V2_PROJECTION_ROUTE,
  OVERLAY_V2_SNAPSHOT_EVENT,
  OVERLAY_V2_STATUS_EVENT,
  type OverlayFrameV2EventSourceLike,
} from "./overlay-frame-v2-store";

afterEach(() => vi.useRealTimers());

describe("OverlayFrame v2 store", () => {
  it("decodes the generated Go contract strictly", () => {
    const update = golden();
    expect(decodeOverlayUpdateV2(JSON.stringify(update))).toEqual(update);
    expect(() => decodeOverlayUpdateV2({ ...update, unexpected: true })).toThrow(
      "overlay-frame-v2:invalid-contract:update",
    );
    expect(() => decodeOverlayUpdateV2({ ...update, revision: 0 })).toThrow(
      "overlay-frame-v2:invalid-contract:revision",
    );
    expect(() => decodeOverlayUpdateV2({
      ...update,
      source: { ...update.source, state: "connected" },
    })).toThrow("overlay-frame-v2:invalid-contract:source.state");
    expect(() => decodeOverlayUpdateV2({
      ...update,
      frame: {
        ...update.frame,
        capabilities: {
          ...update.frame?.capabilities,
          performance: { ...update.frame?.capabilities.performance, level: 6 },
        },
      },
    })).toThrow("overlay-frame-v2:invalid-contract:frame.capabilities.performance.level");
    expect(() => decodeOverlayUpdateV2({
      ...update,
      frame: {
        ...update.frame,
        capabilities: {
          ...update.frame?.capabilities,
          performance: { ...update.frame?.capabilities.performance, reason: "free-text" },
        },
      },
    })).toThrow("overlay-frame-v2:invalid-contract:frame.capabilities.performance.reason");
  });

  it("accepts revision gaps and retains one stable immutable frame reference", () => {
    const store = createOverlayFrameV2Store({ now: () => Date.parse("2026-08-19T12:00:00Z") });
    store.ingest(OVERLAY_V2_SNAPSHOT_EVENT, golden());
    const frame = store.getSnapshot().frame;
    expect(Object.isFrozen(frame)).toBe(true);
    expect(Object.isFrozen(frame?.player)).toBe(true);

    store.ingest(OVERLAY_V2_STATUS_EVENT, {
      revision: 9,
      source: { state: "degraded", retry: 2, reason: "retrying" },
      frame: null,
    });
    expect(store.getSnapshot().revision).toBe(9);
    expect(store.getSnapshot().frame).toBe(frame);
    expect(() => store.ingest(OVERLAY_V2_STATUS_EVENT, {
      revision: 8,
      source: { state: "live" },
      frame: null,
    })).toThrow("overlay-frame-v2:invalid-contract:revision");
  });

  it("normalizes a rollout frame without performance to level 1 parity", () => {
    const legacy = JSON.parse(JSON.stringify(golden())) as Record<string, unknown>;
    const frame = legacy.frame as { capabilities: Record<string, unknown> };
    delete frame.capabilities.performance;

    const decoded = decodeOverlayUpdateV2(JSON.stringify(legacy));
    expect(decoded.frame?.capabilities.performance).toEqual({
      level: 1,
      mode: "manual",
      effects: "full",
      rafCap: null,
      widgetHz: {},
      sourceHz: 0,
      reason: "unavailable",
    });
  });

  it("reuses the freshness watchdog without cloning the frame", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-19T12:00:00Z"));
    const original = golden();
    if (!original.frame) throw new Error("golden frame missing");
    const update: OverlayUpdateV2 = {
      ...original,
      frame: { ...original.frame, generatedAt: "2026-08-19T12:00:00Z" },
    };
    const store = createOverlayFrameV2Store();
    const unsubscribe = store.subscribe(() => undefined);
    store.ingest(OVERLAY_V2_SNAPSHOT_EVENT, update);
    const frame = store.getSnapshot().frame;

    vi.advanceTimersByTime(1_100);

    expect(store.getSnapshot().ageMs).toBe(1_100);
    expect(store.getSnapshot().source?.state).toBe("stale");
    expect(store.getSnapshot().frame).toBe(frame);
    unsubscribe();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("resets the revision stream for a new directed consumer session", () => {
    const store = createOverlayFrameV2Store();
    store.ingest(OVERLAY_V2_STATUS_EVENT, {
      revision: 50,
      source: { state: "live" },
      frame: null,
    });

    store.reset();

    expect(store.getSnapshot()).toEqual({ revision: 0, ageMs: 0 });
    expect(() => store.ingest(OVERLAY_V2_STATUS_EVENT, {
      revision: 2,
      source: { state: "connecting" },
      frame: null,
    })).not.toThrow();
    expect(store.getSnapshot().revision).toBe(2);
  });

  it("attaches Wails listeners before requesting ReplaySnapshot", () => {
    const listeners = new Map<string, (data: unknown) => void>();
    const order: string[] = [];
    const store = createOverlayFrameV2Store();
    const detach = attachOverlayFrameV2Transport(store, {
      subscribe(name, listener) {
        order.push(name);
        listeners.set(name, listener);
        return () => listeners.delete(name);
      },
    }, undefined, () => order.push("replay"));
    expect(order).toEqual([OVERLAY_V2_STATUS_EVENT, OVERLAY_V2_SNAPSHOT_EVENT, "replay"]);
    listeners.get(OVERLAY_V2_SNAPSHOT_EVENT)?.(JSON.stringify(golden()));
    expect(store.getSnapshot().frame?.contract).toBe(2);
    expect(store.getDiagnostics().overlay_v2_parse_duration.count).toBe(1);
    detach();
    expect(listeners.size).toBe(0);
  });

  it("uses the same store decoder for SSE", () => {
    const source = new FakeEventSource();
    const store = createOverlayFrameV2Store();
    const onError = vi.fn();
    const detach = attachOverlayFrameV2Sse(store, {
      createEventSource(url) {
        expect(url).toBe(OVERLAY_V2_PROJECTION_ROUTE);
        return source;
      },
      onError,
    });
    source.emit(OVERLAY_V2_SNAPSHOT_EVENT, JSON.stringify(golden()));
    source.emit(OVERLAY_V2_SNAPSHOT_EVENT, "not-json");
    expect(store.getSnapshot().frame?.contract).toBe(2);
    expect(onError).toHaveBeenCalledTimes(1);
    detach();
    expect(source.closed).toBe(true);
  });
});

function golden(): OverlayUpdateV2 {
  return JSON.parse(readFileSync(path.resolve(
    process.cwd(),
    "../internal/telemetry/projection/overlayv2/testdata/overlay_v2_1.golden.json",
  ), "utf8")) as OverlayUpdateV2;
}

class FakeEventSource implements OverlayFrameV2EventSourceLike {
  readonly listeners = new Map<string, (event: { data: unknown }) => void>();
  closed = false;

  addEventListener(type: string, listener: (event: { data: unknown }) => void): void {
    this.listeners.set(type, listener);
  }

  close(): void {
    this.closed = true;
  }

  emit(type: string, data: unknown): void {
    this.listeners.get(type)?.({ data });
  }
}
