import { bench, describe } from "vitest";
import goldenV2Raw from "../../../../internal/telemetry/projection/overlayv2/testdata/overlay_v2_1.golden.json?raw";
import type { OverlayUpdateV2 } from "../../generated/telemetry";
import { decodeOverlayUpdateV2 } from "../../telemetry-transport/overlay-frame-v2-store";
import { createTelemetryRateCoordinator } from "./telemetry-rate-coordinator";

const sharedUpdate = structuredClone(decodeOverlayUpdateV2(goldenV2Raw)) as OverlayUpdateV2;
const independentUpdates = [
  decodeOverlayUpdateV2(JSON.parse(goldenV2Raw)),
  decodeOverlayUpdateV2(JSON.parse(goldenV2Raw)),
  decodeOverlayUpdateV2(JSON.parse(goldenV2Raw)),
] as const;

describe("telemetry coordinator stable publication", () => {
  {
    const coordinator = createTelemetryRateCoordinator();
    let sequence = sharedUpdate.frame?.sequence ?? 0;

    bench(
      "publish with shared capabilities/source references",
      () => {
        sequence += 1;
        coordinator.setOverlayFrame(
          sharedUpdate.frame ? { ...sharedUpdate.frame, sequence } : undefined,
          sharedUpdate.source,
        );
        coordinator.getOverlayRuntimeContext();
      },
      { time: 1000 },
    );
  }

  {
    const coordinator = createTelemetryRateCoordinator();
    let sequence = independentUpdates[0].frame?.sequence ?? 0;
    coordinator.setOverlayFrame(independentUpdates[0].frame ?? undefined, independentUpdates[0].source);

    bench(
      "publish with equivalent independently decoded objects",
      () => {
        sequence += 1;
        // The retained runtime context owns update 0. Alternating only updates
        // 1 and 2 prevents the identity fast path on every measured iteration.
        const update = independentUpdates[1 + (sequence % 2)]!;
        coordinator.setOverlayFrame(
          update.frame ? { ...update.frame, sequence } : undefined,
          update.source,
        );
        coordinator.getOverlayRuntimeContext();
      },
      { time: 1000 },
    );
  }
});
