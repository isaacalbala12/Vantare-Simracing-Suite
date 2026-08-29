import { describe, expect, it } from "vitest";
import { overlayV2ViewModelRegistry, getOverlayV2ViewModelEntry } from "./overlay-v2-view-models";
import {
  DEFAULT_OVERLAY_V2_FEATURES,
  hasOverlayV2Feature,
} from "../telemetry-shadow/overlay-v2-features";
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
  it("mantiene todo el catálogo V2 activo por defecto", () => {
    expect(DEFAULT_OVERLAY_V2_FEATURES).toHaveLength(9);
  });

  it("registra exactamente los 18 widgets con VM v2 y cada uno con feature valida", () => {
    const expected = new Map([
      ["standings", "standings"],
      ["relative", "relative"],
      ["delta", "delta"],
      ["fuel-strategy", "fuel"],
      ["pedals-telemetry", "player-instruments"],
      ["input-telemetry", "controls"],
      ["racing-flags", "session"],
      ["delta-advanced", "delta"],
      ["delta-trace", "delta"],
      ["pedals", "player-instruments"],
      ["pedals-telemetry-compact", "player-instruments"],
      ["multiclass-relative", "relative"],
      ["head-to-head", "relative"],
      ["track-map", "standings"],
      ["broadcast-tower", "standings"],
      ["track-weather", "weather"],
      ["car-damage-numbers", "damage"],
      ["car-damage-visual", "damage"],
    ]);
    expect(overlayV2ViewModelRegistry.size).toBe(expected.size);
    for (const [widgetType, feature] of expected) {
      const entry = getOverlayV2ViewModelEntry(widgetType as never);
      expect(entry, `entry missing for ${widgetType}`).toBeDefined();
      expect(entry?.feature).toBe(feature);
      expect(typeof entry?.buildViewModelV2).toBe("function");
      expect(hasOverlayV2Feature(undefined, entry!.feature)).toBe(true);
    }
  });

  it("todo tipo registrado tiene builder valido", () => {
    for (const [type, entry] of overlayV2ViewModelRegistry) {
      expect(typeof type).toBe("string");
      expect(typeof entry.feature).toBe("string");
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
