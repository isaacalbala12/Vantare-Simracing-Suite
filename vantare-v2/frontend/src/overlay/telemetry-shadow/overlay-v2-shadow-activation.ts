import type { TelemetrySnapshot } from "../core/telemetry-snapshot";
import type { OverlayFrameV2Store } from "../../telemetry-transport/overlay-frame-v2-store";
import {
  createOverlayV2ShadowRuntime,
  type OverlayV2ShadowRuntime,
} from "./overlay-v2-shadow-runtime";

export type OverlayV2ShadowActivation = Readonly<{
  acceptLegacy(epoch: number, sequence: number, snapshot: TelemetrySnapshot): void;
  sessionSummary(): ReturnType<OverlayV2ShadowRuntime["sessionSummary"]> | null;
  dispose(): void;
}>;

export function createOverlayV2ShadowActivation(
  store: OverlayFrameV2Store,
  createRuntime: () => OverlayV2ShadowRuntime = createOverlayV2ShadowRuntime,
): OverlayV2ShadowActivation {
  let runtime: OverlayV2ShadowRuntime | undefined;
  let unsubscribe: (() => void) | undefined;

  const syncOverlayV2 = () => {
    const state = store.getSnapshot();
    if (state.frame && state.source) runtime?.acceptOverlayV2(state.frame, state.source);
  };

  return {
    acceptLegacy(epoch, sequence, snapshot) {
      if (!runtime) {
        runtime = createRuntime();
        unsubscribe = store.subscribe(syncOverlayV2);
        syncOverlayV2();
      }
      runtime.acceptLegacy(epoch, sequence, snapshot);
    },
    sessionSummary: () => runtime?.sessionSummary() ?? null,
    dispose() {
      unsubscribe?.();
      unsubscribe = undefined;
      runtime = undefined;
    },
  };
}
