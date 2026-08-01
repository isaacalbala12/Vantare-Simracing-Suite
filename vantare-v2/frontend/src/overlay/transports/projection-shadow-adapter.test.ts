import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { eventName, type JSONObject, type ProjectionEnvelope } from "../../telemetry-transport/contracts";
import type { TelemetryRateCoordinator } from "../core/telemetry-rate-coordinator";
import {
  createShadowedTelemetryAdapter,
  createSseProjectionShadowObserver,
  createWailsProjectionShadowObserver,
  type ProjectionEventSourceLike,
} from "./projection-shadow-adapter";

describe("projection shadow adapters", () => {
  it("observes identical Wails and SSE projection state without becoming render authority", () => {
    const handlers = new Map<string, (data: unknown) => void>();
    const wails = createWailsProjectionShadowObserver({
      runtime: "studio",
      subscribe: (name, listener) => {
        handlers.set(name, listener);
        return () => handlers.delete(name);
      },
    });
    const source = new FakeEventSource();
    const sse = createSseProjectionShadowObserver({
      runtime: "obs",
      createEventSource: () => source,
    });
    wails.start();
    sse.start();

    const status = {
      product: "overlay",
      statusRevision: 1,
      capturedAt: "2026-07-19T20:21:22Z",
      payload: { state: "live", reconnectAttempt: 0 },
    };
    const projection = readGoldenEnvelope();
    handlers.get(eventName("overlay", "status"))?.(status);
    handlers.get(eventName("overlay", "projection"))?.(projection);
    source.emit(eventName("overlay", "status"), JSON.stringify(status));
    source.emit(eventName("overlay", "projection"), JSON.stringify(projection));

    expect({ ...wails.getDiagnostics(), runtime: undefined }).toEqual({
      ...sse.getDiagnostics(),
      runtime: undefined,
    });
    expect(wails.getDiagnostics()).toMatchObject({
      status: "live",
      epoch: projection.epoch,
      sequence: projection.sequence,
    });
    source.emit("error", "");
    source.emit(eventName("overlay", "status"), JSON.stringify({
      ...status,
      statusRevision: 7,
    }));
    source.emit(eventName("overlay", "projection"), JSON.stringify({
      ...projection,
      statusRevision: 7,
    }));
    expect(sse.getDiagnostics()).toMatchObject({
      runtime: "obs",
      status: "live",
      result: wails.getDiagnostics().result,
    });
    wails.stop();
    sse.stop();
  });

  it("keeps menu/no-session as a waiting shadow state", () => {
    const handlers = new Map<string, (data: unknown) => void>();
    const observer = createWailsProjectionShadowObserver({
      runtime: "desktop",
      subscribe: (name, listener) => {
        handlers.set(name, listener);
        return () => handlers.delete(name);
      },
    });
    observer.start();
    handlers.get(eventName("overlay", "status"))?.({
      product: "overlay",
      statusRevision: 1,
      capturedAt: "2026-07-19T20:21:22Z",
      payload: { state: "detecting", reconnectAttempt: 0 },
    });
    expect(observer.getDiagnostics()).toEqual({
      runtime: "desktop",
      status: "detecting",
      result: "waiting",
    });
    observer.stop();
  });

  it("fails open when shadow startup fails", () => {
    const coordinator = {} as TelemetryRateCoordinator;
    const authoritative = {
      coordinator,
      start: vi.fn(),
      stop: vi.fn(),
    };
    const adapter = createShadowedTelemetryAdapter(authoritative, {
      start: () => {
        throw new Error("shadow unavailable");
      },
      stop: vi.fn(),
      getDiagnostics: () => ({ runtime: "studio", result: "error" }),
    });
    expect(() => adapter.start()).not.toThrow();
    expect(authoritative.start).toHaveBeenCalledOnce();
    adapter.stop();
    expect(authoritative.stop).toHaveBeenCalledOnce();
  });
});

class FakeEventSource implements ProjectionEventSourceLike {
  private readonly listeners = new Map<string, (event: { data: unknown }) => void>();

  addEventListener(type: string, listener: (event: { data: unknown }) => void): void {
    this.listeners.set(type, listener);
  }

  emit(type: string, data: unknown): void {
    this.listeners.get(type)?.({ data });
  }

  close(): void {}
}

function readGoldenEnvelope(): ProjectionEnvelope {
  const snapshot = JSON.parse(
    readFileSync(
      path.resolve(
        process.cwd(),
        "../internal/telemetry/projection/overlay/testdata/overlay_v1.golden.json",
      ),
      "utf8",
    ),
  ) as Record<string, unknown>;
  const payload = { ...snapshot } as JSONObject;
  delete payload.canonicalVersion;
  delete payload.projectionVersion;
  delete payload.epoch;
  delete payload.sequence;
  delete payload.capturedAt;
  return {
    product: "overlay",
    projectionVersion: snapshot.projectionVersion as number,
    epoch: snapshot.epoch as number,
    sequence: snapshot.sequence as number,
    kind: "full",
    capturedAt: snapshot.capturedAt as string,
    statusRevision: 1,
    payload,
  };
}
