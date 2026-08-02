import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { eventName, type JSONObject, type ProjectionEnvelope } from "../../telemetry-transport/contracts";
import type { TelemetryRateCoordinator } from "../core/telemetry-rate-coordinator";
import type { TelemetrySnapshot } from "../core/telemetry-snapshot";
import { createWailsProjectionTelemetryAdapter } from "./projection-telemetry-adapter";

describe("canonical projection telemetry adapter", () => {
  it("publishes canonical mapped, stale and disconnected snapshots", () => {
    const handlers = new Map<string, (data: unknown) => void>();
    const snapshots: TelemetrySnapshot[] = [];
    const adapter = createWailsProjectionTelemetryAdapter({
      coordinator: coordinator(snapshots),
      runtime: "desktop",
      now: () => 1_000,
      subscribe: (name, listener) => {
        handlers.set(name, listener);
        return () => handlers.delete(name);
      },
    });
    adapter.start();
    const projection = readGoldenEnvelope();
    emitStatus(handlers, 1, "live");
    handlers.get(eventName("overlay", "projection"))?.(projection);
    expect(snapshots.at(-1)).toMatchObject({
      status: "ready",
      player: { inPit: false, speedKph: 0 },
    });
    emitStatus(handlers, 2, "stale");
    expect(snapshots.at(-1)?.status).toBe("stale");
    emitStatus(handlers, 3, "stopped");
    expect(snapshots.at(-1)?.status).toBe("disconnected");
    adapter.stop();
  });

  it("fails closed when a live projection has no demonstrated player", () => {
    const handlers = new Map<string, (data: unknown) => void>();
    const snapshots: TelemetrySnapshot[] = [];
    const adapter = createWailsProjectionTelemetryAdapter({
      coordinator: coordinator(snapshots),
      runtime: "studio",
      subscribe: (name, listener) => {
        handlers.set(name, listener);
        return () => handlers.delete(name);
      },
    });
    adapter.start();
    emitStatus(handlers, 1, "live");
    const projection = readGoldenEnvelope();
    handlers.get(eventName("overlay", "projection"))?.({
      ...projection,
      payload: { ...projection.payload, playerVehicleId: "missing-player" },
    });
    expect(snapshots.at(-1)?.status).toBe("disconnected");
    adapter.stop();
  });
});

function coordinator(snapshots: TelemetrySnapshot[]): TelemetryRateCoordinator {
  return {
    getSnapshot: vi.fn(),
    subscribe: vi.fn(),
    publish: (snapshot) => snapshots.push(snapshot),
    dispose: vi.fn(),
  } as unknown as TelemetryRateCoordinator;
}

function emitStatus(
  handlers: Map<string, (data: unknown) => void>,
  statusRevision: number,
  state: "live" | "stale" | "stopped",
): void {
  handlers.get(eventName("overlay", "status"))?.({
    product: "overlay",
    statusRevision,
    capturedAt: "2026-07-28T09:00:00Z",
    payload: { state, reconnectAttempt: 0 },
  });
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
  for (const key of ["canonicalVersion", "projectionVersion", "epoch", "sequence", "capturedAt"]) {
    delete payload[key];
  }
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
