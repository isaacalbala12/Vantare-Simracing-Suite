import {
  eventName,
  projectionRoute,
  TransportContractError,
  type StatusState,
} from "../../telemetry-transport/contracts";
import { attachProjectionTransport, type TransportEventSource } from "../../telemetry-transport/attach";
import { createProjectionTransportStore } from "../../telemetry-transport/store";
import {
  adaptOverlayProjectionToSnapshot,
  type OverlayProjectionAdaptation,
} from "../telemetry-shadow/overlay-projection-adapter";
import {
  decodeOverlayProjectionV1,
  OverlayProjectionDecodeError,
} from "../telemetry-shadow/overlay-projection-v1";
import type { TelemetryAdapter } from "./wails-telemetry-adapter";

export type OverlayShadowRuntime = "studio" | "desktop" | "obs";

export type OverlayShadowDiagnostics = Readonly<{
  runtime: OverlayShadowRuntime;
  status?: StatusState;
  epoch?: number;
  sequence?: number;
  result: "waiting" | "mapped" | "blocked" | "error" | "stopped";
  blockCode?: string;
  errorCode?: string;
}>;

export type ProjectionShadowObserver = {
  start(): void;
  stop(): void;
  getDiagnostics(): OverlayShadowDiagnostics;
};

type ObserverOptions = Readonly<{
  runtime: OverlayShadowRuntime;
  source: TransportEventSource;
  onDiagnostics?: (diagnostics: OverlayShadowDiagnostics) => void;
}>;

export function createWailsProjectionShadowObserver(options: Readonly<{
  runtime: OverlayShadowRuntime;
  subscribe: TransportEventSource["subscribe"];
  onDiagnostics?: (diagnostics: OverlayShadowDiagnostics) => void;
}>): ProjectionShadowObserver {
  return createProjectionShadowObserver({
    runtime: options.runtime,
    source: { subscribe: options.subscribe },
    onDiagnostics: options.onDiagnostics,
  });
}

export function createProjectionShadowObserver(
  options: ObserverOptions,
): ProjectionShadowObserver {
  const store = createProjectionTransportStore("overlay");
  let started = false;
  let detach: (() => void) | undefined;
  let unsubscribeStore: (() => void) | undefined;
  let diagnostics: OverlayShadowDiagnostics = {
    runtime: options.runtime,
    result: "stopped",
  };

  const publish = (next: OverlayShadowDiagnostics) => {
    diagnostics = Object.freeze(next);
    options.onDiagnostics?.(diagnostics);
  };

  const observe = () => {
    const state = store.getSnapshot();
    const status = state.status?.payload.state;
    if (!state.snapshot || !status) {
      publish({ runtime: options.runtime, status, result: "waiting" });
      return;
    }
    try {
      const projection = decodeOverlayProjectionV1(state.snapshot);
      const result = adaptOverlayProjectionToSnapshot(projection, {
        transportState: status,
      });
      publish(adaptationDiagnostics(
        options.runtime,
        status,
        state.snapshot.epoch,
        state.snapshot.sequence,
        result,
      ));
    } catch (error) {
      publish({
        runtime: options.runtime,
        status,
        epoch: state.snapshot.epoch,
        sequence: state.snapshot.sequence,
        result: "error",
        errorCode: stableErrorCode(error),
      });
    }
  };

  return {
    start() {
      if (started) return;
      started = true;
      unsubscribeStore = store.subscribe(observe);
      try {
        detach = attachProjectionTransport(store, options.source, (error) => {
          const state = store.getSnapshot();
          publish({
            runtime: options.runtime,
            status: state.status?.payload.state,
            epoch: state.snapshot?.epoch,
            sequence: state.snapshot?.sequence,
            result: "error",
            errorCode: stableErrorCode(error),
          });
        });
        observe();
      } catch (error) {
        unsubscribeStore?.();
        unsubscribeStore = undefined;
        started = false;
        throw error;
      }
    },
    stop() {
      if (!started) return;
      started = false;
      detach?.();
      unsubscribeStore?.();
      detach = undefined;
      unsubscribeStore = undefined;
      publish({ runtime: options.runtime, result: "stopped" });
    },
    getDiagnostics() {
      return diagnostics;
    },
  };
}

export type ProjectionEventSourceLike = {
  addEventListener(type: string, listener: (event: { data: unknown }) => void): void;
  close(): void;
};

export function createSseProjectionShadowObserver(options: Readonly<{
  runtime: OverlayShadowRuntime;
  url?: string;
  createEventSource?: (url: string) => ProjectionEventSourceLike;
  onDiagnostics?: (diagnostics: OverlayShadowDiagnostics) => void;
}>): ProjectionShadowObserver {
  const listeners = new Map<string, Set<(data: unknown) => void>>();
  const factory = options.createEventSource ?? ((url: string) => new EventSource(url));
  let source: ProjectionEventSourceLike | undefined;
  const transportSource: TransportEventSource = {
    subscribe(name, listener) {
      let group = listeners.get(name);
      if (!group) {
        group = new Set();
        listeners.set(name, group);
      }
      group.add(listener);
      return () => group?.delete(listener);
    },
  };
  const buildObserver = () => createProjectionShadowObserver({
      runtime: options.runtime,
      source: transportSource,
      onDiagnostics: options.onDiagnostics,
    });
  let observer = buildObserver();
  return {
    start() {
      observer.start();
      try {
        source = factory(options.url ?? projectionRoute("overlay"));
        for (const kind of ["status", "projection", "fact"] as const) {
          const name = eventName("overlay", kind);
          source.addEventListener(name, (event) => {
            for (const listener of listeners.get(name) ?? []) listener(event.data);
          });
        }
        source.addEventListener("error", () => {
          // EventSource reconnects automatically. Rebuild the transport store
          // so a retained status/full pair may establish a fresh cursor.
          observer.stop();
          observer = buildObserver();
          observer.start();
        });
      } catch (error) {
        observer.stop();
        throw error;
      }
    },
    stop() {
      source?.close();
      source = undefined;
      observer.stop();
    },
    getDiagnostics() {
      return observer.getDiagnostics();
    },
  };
}

export function createShadowedTelemetryAdapter(
  authoritative: TelemetryAdapter,
  shadow: ProjectionShadowObserver,
): TelemetryAdapter {
  let started = false;
  return {
    coordinator: authoritative.coordinator,
    start() {
      if (started) return;
      authoritative.start();
      try {
        shadow.start();
      } catch {
        // Shadow observation is deliberately fail-open during TC-07B. The
        // legacy adapter remains the only render authority.
      }
      started = true;
    },
    stop() {
      if (!started) return;
      started = false;
      shadow.stop();
      authoritative.stop();
    },
  };
}

function adaptationDiagnostics(
  runtime: OverlayShadowRuntime,
  status: StatusState,
  epoch: number,
  sequence: number,
  result: OverlayProjectionAdaptation,
): OverlayShadowDiagnostics {
  if (result.kind === "blocked") {
    return { runtime, status, result: "blocked", blockCode: result.code };
  }
  return {
    runtime,
    status,
    epoch,
    sequence,
    result: "mapped",
  };
}

function stableErrorCode(error: unknown): string {
  if (error instanceof TransportContractError || error instanceof OverlayProjectionDecodeError) {
    return error.code;
  }
  return "shadow-observer-error";
}
