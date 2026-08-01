import {
  snapshotFromDisconnected,
  snapshotFromError,
  snapshotFromStale,
} from "../core/telemetry-adapter";
import type { TelemetryRateCoordinator } from "../core/telemetry-rate-coordinator";
import type { TelemetrySnapshot } from "../core/telemetry-snapshot";
import {
  createSseProjectionShadowObserver,
  createWailsProjectionShadowObserver,
  type OverlayProjectionObservation,
  type OverlayShadowDiagnostics,
  type OverlayShadowRuntime,
  type ProjectionEventSourceLike,
  type ProjectionShadowObserver,
} from "./projection-shadow-adapter";
import type { TelemetryAdapter } from "./wails-telemetry-adapter";

type CommonOptions = Readonly<{
  coordinator: TelemetryRateCoordinator;
  runtime: OverlayShadowRuntime;
  now?: () => number;
}>;

export function createWailsProjectionTelemetryAdapter(options: CommonOptions & Readonly<{
  subscribe: (event: string, handler: (data: unknown) => void) => () => void;
}>): TelemetryAdapter {
  return createProjectionTelemetryAdapter(options, (callbacks) =>
    createWailsProjectionShadowObserver({
      runtime: options.runtime,
      subscribe: options.subscribe,
      ...callbacks,
    }));
}

export function createSseProjectionTelemetryAdapter(options: CommonOptions & Readonly<{
  url?: string;
  createEventSource?: (url: string) => ProjectionEventSourceLike;
}>): TelemetryAdapter {
  return createProjectionTelemetryAdapter(options, (callbacks) =>
    createSseProjectionShadowObserver({
      runtime: options.runtime,
      url: options.url,
      createEventSource: options.createEventSource,
      ...callbacks,
    }));
}

function createProjectionTelemetryAdapter(
  options: CommonOptions,
  buildObserver: (callbacks: Readonly<{
    onObservation: (observation: OverlayProjectionObservation) => void;
    onDiagnostics: (diagnostics: OverlayShadowDiagnostics) => void;
  }>) => ProjectionShadowObserver,
): TelemetryAdapter {
  const now = options.now ?? (() => Date.now());
  let started = false;
  let lastSnapshot: TelemetrySnapshot | undefined;
  let lastStatus: string | undefined;

  const publishFallback = (status: OverlayProjectionObservation["status"], force = false) => {
    const key = status ?? "missing";
    if (!force && key === lastStatus) return;
    lastStatus = key;
    if ((status === "degraded" || status === "stale") && lastSnapshot) {
      options.coordinator.publish(snapshotFromStale(lastSnapshot, now()));
      return;
    }
    if (status === "error") {
      options.coordinator.publish(snapshotFromError(now(), "overlay-projection-transport-error"));
      return;
    }
    options.coordinator.publish(snapshotFromDisconnected(now()));
  };

  const observer = buildObserver({
    onObservation(observation) {
      if (observation.adaptation?.kind === "mapped") {
        lastSnapshot = observation.adaptation.snapshot;
        lastStatus = observation.status;
        options.coordinator.publish(observation.adaptation.snapshot);
        return;
      }
      publishFallback(observation.status, observation.adaptation?.kind === "blocked");
    },
    onDiagnostics(diagnostics) {
      if (diagnostics.result === "error") {
        lastStatus = "error";
        options.coordinator.publish(
          snapshotFromError(now(), `overlay-projection-${diagnostics.errorCode ?? "error"}`),
        );
      }
    },
  });

  return {
    coordinator: options.coordinator,
    start() {
      if (started) return;
      started = true;
      try {
        observer.start();
      } catch (error) {
        started = false;
        throw error;
      }
    },
    stop() {
      if (!started) return;
      started = false;
      observer.stop();
      lastSnapshot = undefined;
      lastStatus = "stopped";
      options.coordinator.publish(snapshotFromDisconnected(now()));
    },
  };
}
