import type { TelemetryRateCoordinator } from "./telemetry-rate-coordinator";
import type { OverlayFrameV2Store } from "../../telemetry-transport/overlay-frame-v2-store";
import type { OverlayFrameV2, OverlaySourceStatusV2 } from "../../generated/telemetry";

export type OverlayV2Observation = (
  frame: OverlayFrameV2,
  source: OverlaySourceStatusV2,
) => void;

// Une una generación del store con su coordinador sin introducir una
// suscripción React. Esta es la única entrada de frames v2 hacia los widgets.
export function bindOverlayV2Coordinator(
  store: OverlayFrameV2Store,
  coordinator: TelemetryRateCoordinator,
  observe?: OverlayV2Observation,
): () => void {
  const sync = () => {
    const state = store.getSnapshot();
    coordinator.setOverlayFrame(state.frame, state.source);
    if (state.frame && state.source) observe?.(state.frame, state.source);
  };
  sync();
  return store.subscribe(sync);
}
