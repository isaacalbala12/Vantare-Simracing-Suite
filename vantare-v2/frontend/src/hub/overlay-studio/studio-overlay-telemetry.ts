import type { TelemetryAdapter } from '../../overlay/transports/telemetry-adapter';
import {
  attachOverlayFrameV2Transport,
  type OverlayFrameV2Store,
} from '../../telemetry-transport/overlay-frame-v2-store';
import type { OverlayWailsPullClient } from '../../telemetry-transport/overlay-wails-pull';

export type StudioOverlayTelemetryOptions = Readonly<{
  legacy: TelemetryAdapter;
  pull: OverlayWailsPullClient;
  overlayV2Store: OverlayFrameV2Store;
  onOverlayV2Error?: (error: unknown) => void;
}>;

/**
 * One Studio lifecycle owns both Overlay projections. Listeners for V1 and V2
 * are attached before the bounded pull session starts, so neither projection
 * needs a global Wails telemetry event or a second producer.
 */
export function createStudioOverlayTelemetryAdapter(
  options: StudioOverlayTelemetryOptions,
): TelemetryAdapter {
  let started = false;
  let detachOverlayV2: (() => void) | undefined;

  const stopStartedParts = () => {
    const detach = detachOverlayV2;
    detachOverlayV2 = undefined;
    started = false;
    let firstError: unknown;
    for (const stop of [
      () => options.pull.stop(),
      () => options.legacy.stop(),
      () => detach?.(),
    ]) {
      try {
        stop();
      } catch (error) {
        firstError ??= error;
      }
    }
    if (firstError !== undefined) throw firstError;
  };

  return {
    coordinator: options.legacy.coordinator,
    start() {
      if (started) return;
      // Studio can switch Mock -> Live without remounting this store. A new
      // pull session may first replay an older retained lifecycle status, so
      // its revision space must start clean together with the consumer.
      options.overlayV2Store.reset();
      detachOverlayV2 = attachOverlayFrameV2Transport(
        options.overlayV2Store,
        options.pull.source,
        options.onOverlayV2Error,
      );
      try {
        options.legacy.start();
        options.pull.start();
        started = true;
      } catch (error) {
        try {
          stopStartedParts();
        } catch {
          // Preserve the start failure; cleanup is best effort on this path.
        }
        throw error;
      }
    },
    stop() {
      if (!started && !detachOverlayV2) return;
      stopStartedParts();
    },
  };
}
