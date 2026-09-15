import { bench, describe } from "vitest";
import goldenV2Raw from "../../../../internal/telemetry/projection/overlayv2/testdata/overlay_v2_1.golden.json?raw";
import type { OverlayUpdateV2 } from "../../generated/telemetry";
import { createTelemetryRateCoordinator } from "./telemetry-rate-coordinator";

const update = JSON.parse(goldenV2Raw) as OverlayUpdateV2;

describe("telemetry coordinator stable publication", () => {
  const coordinator = createTelemetryRateCoordinator();
  let sequence = update.frame?.sequence ?? 0;

  bench(
    "publish and read stable capabilities/source",
    () => {
      sequence += 1;
      coordinator.setOverlayFrame(
        update.frame ? { ...update.frame, sequence } : undefined,
        update.source,
      );
      coordinator.getOverlayRuntimeContext();
    },
    { time: 1000 },
  );
});
