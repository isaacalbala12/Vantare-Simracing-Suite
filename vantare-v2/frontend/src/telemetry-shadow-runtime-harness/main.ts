import goldenRaw from "../../../internal/telemetry/projection/overlay/testdata/overlay_v1.golden.json?raw";
import { eventName, type JSONObject } from "../telemetry-transport/contracts";
import {
  createSseProjectionShadowObserver,
  createWailsProjectionShadowObserver,
  type OverlayShadowRuntime,
  type ProjectionEventSourceLike,
} from "../overlay/transports/projection-shadow-adapter";

class HarnessEventSource implements ProjectionEventSourceLike {
  private readonly listeners = new Map<string, (event: { data: unknown }) => void>();
  addEventListener(type: string, listener: (event: { data: unknown }) => void): void {
    this.listeners.set(type, listener);
  }
  emit(type: string, data: unknown): void {
    this.listeners.get(type)?.({ data });
  }
  close(): void {}
}

const runtime = new URLSearchParams(location.search).get("runtime") as OverlayShadowRuntime;
if (!(["studio", "desktop", "obs"] as const).includes(runtime)) {
  throw new Error("invalid runtime");
}

const snapshot = JSON.parse(goldenRaw) as Record<string, unknown>;
const payload = { ...snapshot } as JSONObject;
for (const key of ["canonicalVersion", "projectionVersion", "epoch", "sequence", "capturedAt"]) {
  delete payload[key];
}
const status = {
  product: "overlay",
  statusRevision: 1,
  capturedAt: "2026-07-28T09:00:00Z",
  payload: { state: "live", reconnectAttempt: 0 },
};
const projection = {
  product: "overlay",
  projectionVersion: snapshot.projectionVersion,
  epoch: snapshot.epoch,
  sequence: snapshot.sequence,
  kind: "full",
  capturedAt: snapshot.capturedAt,
  statusRevision: 1,
  payload,
};

if (runtime === "obs") {
  const source = new HarnessEventSource();
  const observer = createSseProjectionShadowObserver({
    runtime,
    createEventSource: () => source,
  });
  observer.start();
  source.emit(eventName("overlay", "status"), JSON.stringify(status));
  source.emit(eventName("overlay", "projection"), JSON.stringify(projection));
  render(observer.getDiagnostics());
  observer.stop();
} else {
  const handlers = new Map<string, (data: unknown) => void>();
  const observer = createWailsProjectionShadowObserver({
    runtime,
    subscribe: (name, listener) => {
      handlers.set(name, listener);
      return () => handlers.delete(name);
    },
  });
  observer.start();
  handlers.get(eventName("overlay", "status"))?.(status);
  handlers.get(eventName("overlay", "projection"))?.(projection);
  render(observer.getDiagnostics());
  observer.stop();
}

function render(diagnostics: object): void {
  const root = document.querySelector<HTMLElement>("#app");
  if (!root) throw new Error("missing root");
  root.dataset.testid = "shadow-runtime";
  root.innerHTML = `<h1>${runtime}</h1><output data-testid="diagnostics"></output><output data-testid="render-writes">0</output>`;
  const output = root.querySelector<HTMLOutputElement>("[data-testid=diagnostics]");
  if (output) output.value = JSON.stringify(diagnostics);
}
