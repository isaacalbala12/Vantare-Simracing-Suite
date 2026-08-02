import goldenRaw from "../../../internal/telemetry/projection/overlay/testdata/overlay_v1.golden.json?raw";
import { eventName, type JSONObject } from "../telemetry-transport/contracts";
import type { TelemetryRateCoordinator } from "../overlay/core/telemetry-rate-coordinator";
import type { TelemetrySnapshot } from "../overlay/core/telemetry-snapshot";
import {
  createSseProjectionTelemetryAdapter,
  createWailsProjectionTelemetryAdapter,
} from "../overlay/transports/projection-telemetry-adapter";
import type { OverlayRuntime, ProjectionEventSourceLike } from "../overlay/transports/projection-observer";

class HarnessEventSource implements ProjectionEventSourceLike {
  private readonly listeners = new Map<string, (event: { data: unknown }) => void>();
  addEventListener(type: string, listener: (event: { data: unknown }) => void): void { this.listeners.set(type, listener); }
  emit(type: string, data: unknown): void { this.listeners.get(type)?.({ data }); }
  close(): void {}
}

const runtime = new URLSearchParams(location.search).get("runtime") as OverlayRuntime;
if (!(["studio", "desktop", "obs"] as const).includes(runtime)) throw new Error("invalid runtime");
const published: TelemetrySnapshot[] = [];
const coordinator = {
  publish: (snapshot: TelemetrySnapshot) => { published.push(snapshot); },
} as unknown as TelemetryRateCoordinator;
const projection = envelope();
const status = {
  product: "overlay",
  statusRevision: 1,
  capturedAt: projection.capturedAt,
  payload: { state: "live", reconnectAttempt: 0 },
};

if (runtime === "obs") {
  const source = new HarnessEventSource();
  const adapter = createSseProjectionTelemetryAdapter({
    coordinator,
    runtime,
    createEventSource: () => source,
  });
  adapter.start();
  source.emit(eventName("overlay", "status"), JSON.stringify(status));
  source.emit(eventName("overlay", "projection"), JSON.stringify(projection));
} else {
  const handlers = new Map<string, (data: unknown) => void>();
  const adapter = createWailsProjectionTelemetryAdapter({
    coordinator,
    runtime,
    subscribe: (name, listener) => {
      handlers.set(name, listener);
      return () => handlers.delete(name);
    },
  });
  adapter.start();
  handlers.get(eventName("overlay", "status"))?.(status);
  handlers.get(eventName("overlay", "projection"))?.(projection);
}

const last = published.at(-1);
const root = document.querySelector<HTMLElement>("#app");
if (!root || !last) throw new Error("canonical snapshot not published");
root.innerHTML = `<h1>${runtime}</h1><output data-testid="status">${last.status}</output><output data-testid="writes">${published.length}</output>`;

function envelope() {
  const snapshot = JSON.parse(goldenRaw) as Record<string, unknown>;
  const payload = { ...snapshot } as JSONObject;
  for (const key of ["canonicalVersion", "projectionVersion", "epoch", "sequence", "capturedAt"]) delete payload[key];
  return {
    product: "overlay" as const,
    projectionVersion: snapshot.projectionVersion as number,
    epoch: snapshot.epoch as number,
    sequence: snapshot.sequence as number,
    kind: "full" as const,
    capturedAt: snapshot.capturedAt as string,
    statusRevision: 1,
    payload,
  };
}
