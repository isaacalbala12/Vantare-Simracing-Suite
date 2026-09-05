import { describe, expect, it } from "vitest";
import { overlayV2ViewModelRegistry, getOverlayV2ViewModelEntry } from "./overlay-v2-view-models";
import { widgetTypeRegistry } from "./widget-registry";
import { OVERLAY_SHADOW_POLICIES } from "../telemetry-shadow/overlay-shadow-comparator";
import type { OverlayUpdateV2 } from "../../generated/telemetry";
import golden1Raw from "../../../../internal/telemetry/projection/overlayv2/testdata/overlay_v2_1.golden.json?raw";
import golden20Raw from "../../../../internal/telemetry/projection/overlayv2/testdata/overlay_v2_20.golden.json?raw";
import golden44Raw from "../../../../internal/telemetry/projection/overlayv2/testdata/overlay_v2_44.golden.json?raw";
import golden104Raw from "../../../../internal/telemetry/projection/overlayv2/testdata/overlay_v2_104.golden.json?raw";

const CANONICAL_UPDATES = [golden1Raw, golden20Raw, golden44Raw, golden104Raw]
  .map((raw) => JSON.parse(raw) as OverlayUpdateV2);

describe("overlay-v2 view model registry", () => {
  it("registra exactamente los 18 widgets con VM v2 directa, sin catálogo", () => {
    const expected = [
      "standings",
      "relative",
      "delta",
      "fuel-strategy",
      "pedals-telemetry",
      "input-telemetry",
      "racing-flags",
      "delta-advanced",
      "delta-trace",
      "pedals",
      "pedals-telemetry-compact",
      "multiclass-relative",
      "head-to-head",
      "track-map",
      "broadcast-tower",
      "track-weather",
      "car-damage-numbers",
      "car-damage-visual",
    ];
    expect(overlayV2ViewModelRegistry.size).toBe(expected.length);
    for (const widgetType of expected) {
      const entry = getOverlayV2ViewModelEntry(widgetType as never);
      expect(entry, `entry missing for ${widgetType}`).toBeDefined();
      expect(typeof entry?.buildViewModelV2).toBe("function");
    }
  });

  it("todo tipo registrado tiene builder valido", () => {
    for (const [type, entry] of overlayV2ViewModelRegistry) {
      expect(typeof type).toBe("string");
      expect(typeof entry.buildViewModelV2).toBe("function");
      // builder debe aceptar 4 args sin lanzar TypeError inmediato con frame dummy
      expect(entry.buildViewModelV2.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("ejecuta los 18 builders V2 y sus campos declarados en los goldens 1/20/44/104", () => {
    for (const update of CANONICAL_UPDATES) {
      if (!update.frame) throw new Error(`golden ${update.revision} without frame`);
      for (const [type, entry] of overlayV2ViewModelRegistry) {
        const definition = widgetTypeRegistry.get(type);
        const widget = definition.createDefault(`catalog-gate-${update.revision}-${type}`);
        const content = definition.parseContent(widget.content);
        const model = entry.buildViewModelV2(update.frame, update.source, content);
        expect(model.type, `${type} type @${update.revision}`).toBe(type);
        expect(["ready", "missing", "stale", "disconnected", "error"], `${type} status @${update.revision}`)
          .toContain(model.status);
        expect(Object.keys(model).length, `${type} output fields @${update.revision}`).toBeGreaterThan(2);
        expect(JSON.parse(JSON.stringify(model)), `${type} serializable output @${update.revision}`)
          .toMatchObject({ type, status: model.status });
        expect(OVERLAY_SHADOW_POLICIES[type].rules.length, `${type} declared fields`)
          .toBeGreaterThan(0);
      }
    }
  });

  it("no registra widgets que no leen telemetria canonica del frame", () => {
    // race-schedule lee el canal auxiliar de calendario; engineer-radio lee el bus de Engineer.
    expect(getOverlayV2ViewModelEntry("race-schedule" as never)).toBeUndefined();
    expect(getOverlayV2ViewModelEntry("engineer-radio" as never)).toBeUndefined();
  });
});
