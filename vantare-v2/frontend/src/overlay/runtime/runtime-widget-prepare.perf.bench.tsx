import { decodeOverlayUpdateV2 } from "../../telemetry-transport/overlay-frame-v2-store";
import { afterAll, bench, describe } from "vitest";
import { render, act } from "@testing-library/react";
import { createTelemetryRateCoordinator } from "../core/telemetry-rate-coordinator";
import { deltaDefinition } from "../widget-types/delta/delta-definition";
import { trackWeatherDefinition } from "../widget-types/track-weather/track-weather-definition";
import { prepareWidgetVisualSettings } from "../core/widget-visual-settings";
import { RuntimeWidgetFrame } from "./RuntimeWidgetFrame";
import goldenV2Raw from "../../../../internal/telemetry/projection/overlayv2/testdata/overlay_v2_1.golden.json?raw";
import type { OverlayUpdateV2 } from "../../generated/telemetry";

// perf/round2 (F03): mide el coste por notificacion de telemetria con la
// configuracion del widget estable. Antes del cambio cada render reejecutaba
// parseContent + migracion + merge + parseSettings (dos structuredClone por
// widget y frame notificado). Host + renderer completos, no solo el merge.

const update = structuredClone(decodeOverlayUpdateV2(JSON.parse(goldenV2Raw))) as OverlayUpdateV2;

function createManualCoordinator() {
  let onFrame: () => void = () => undefined;
  let nowValue = 0;
  const coordinator = createTelemetryRateCoordinator({
    now: () => nowValue,
    createScheduler: () => ({
      start: (callback) => {
        onFrame = callback;
      },
      stop: () => undefined,
    }),
  });
  return {
    coordinator,
    tick: () => onFrame(),
    advance: (ms: number) => {
      nowValue += ms;
    },
  };
}

function publishNext(coordinator: ReturnType<typeof createManualCoordinator>["coordinator"], sequence: number) {
  coordinator.setOverlayFrame(
    update.frame ? { ...update.frame, sequence } : undefined,
    update.source,
  );
}

for (const widgets of [1, 5, 20]) {
  describe(`RuntimeWidgetFrame telemetry repaint ${widgets} widgets`, () => {
    const { coordinator, tick, advance } = createManualCoordinator();
    coordinator.setOverlayFrame(update.frame ?? undefined, update.source);
    const instances = Array.from({ length: widgets }, (_, i) =>
      deltaDefinition.createDefault(`delta-bench-${i}`),
    );
    const view = render(
      <>
        {instances.map((widget) => (
          <RuntimeWidgetFrame
            key={widget.id}
            widget={widget}
            profileId="profile-bench"
            telemetry={coordinator}
            renderMode="desktop"
          />
        ))}
      </>,
    );
    let sequence = update.frame?.sequence ?? 0;
    bench(
      `repaint ${widgets}w`,
      () => {
        act(() => {
          sequence += 1;
          publishNext(coordinator, sequence);
          advance(1_000);
          tick();
        });
      },
      { time: 2000 },
    );
    afterAll(() => {
      view.unmount();
      coordinator.dispose();
    });
  });
}

describe("prepareWidgetVisualSettings isolation", () => {
  const widget = trackWeatherDefinition.createDefault("tw-bench");
  bench(
    "prepare settings alone",
    () => {
      prepareWidgetVisualSettings(widget);
    },
    { time: 1000 },
  );
});
