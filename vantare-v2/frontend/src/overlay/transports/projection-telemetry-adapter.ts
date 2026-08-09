import {
  snapshotFromDisconnected,
  snapshotFromError,
  snapshotFromStale,
} from "../core/telemetry-adapter";
import type { TelemetryRateCoordinator } from "../core/telemetry-rate-coordinator";
import type { TelemetrySnapshot } from "../core/telemetry-snapshot";
import {
  createSseProjectionObserver,
  createWailsProjectionObserver,
  type OverlayProjectionObservation,
  type OverlayProjectionDiagnostics,
  type OverlayRuntime,
  type ProjectionEventSourceLike,
  type ProjectionObserver,
} from "./projection-observer";
import type { TelemetryAdapter } from "./telemetry-adapter";

type CommonOptions = Readonly<{
  coordinator: TelemetryRateCoordinator;
  runtime: OverlayRuntime;
  now?: () => number;
}>;

export function createWailsProjectionTelemetryAdapter(options: CommonOptions & Readonly<{
  subscribe: (event: string, handler: (data: unknown) => void) => () => void;
  requestStatus?: () => void;
}>): TelemetryAdapter {
  return createProjectionTelemetryAdapter(options, (callbacks) =>
    createWailsProjectionObserver({
      runtime: options.runtime,
      subscribe: options.subscribe,
      requestStatus: options.requestStatus,
      ...callbacks,
    }));
}

export function createSseProjectionTelemetryAdapter(options: CommonOptions & Readonly<{
  url?: string;
  createEventSource?: (url: string) => ProjectionEventSourceLike;
}>): TelemetryAdapter {
  return createProjectionTelemetryAdapter(options, (callbacks) =>
    createSseProjectionObserver({
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
    onDiagnostics: (diagnostics: OverlayProjectionDiagnostics) => void;
  }>) => ProjectionObserver,
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
      // Sin mensaje: el codigo de transporte es diagnostico, no texto de UI.
      options.coordinator.publish(snapshotFromError(now()));
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
        // diagnostics.errorCode se queda en el canal de diagnostico, que es
        // donde sirve. Interpolarlo aqui lo pintaba en el overlay: de ahi salia
        // el "overlay-projection-projection-observer-error" visible en boxes,
        // cuyo prefijo duplicado ya delataba que nadie esperaba leerlo.
        options.coordinator.publish(snapshotFromError(now()));
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
