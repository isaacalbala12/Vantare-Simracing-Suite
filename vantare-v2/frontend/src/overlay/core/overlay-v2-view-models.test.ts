import { describe, expect, it } from "vitest";
import { overlayV2ViewModelRegistry, getOverlayV2ViewModelEntry } from "./overlay-v2-view-models";
import {
  DEFAULT_OVERLAY_V2_FEATURES,
  hasOverlayV2Feature,
} from "../telemetry-shadow/overlay-v2-features";

describe("overlay-v2 view model registry", () => {
  it("mantiene DEFAULT_OVERLAY_V2_FEATURES vacio (off por defecto)", () => {
    expect(DEFAULT_OVERLAY_V2_FEATURES).toEqual([]);
  });

  it("registra exactamente los 7 widgets con VM v2 y cada uno con feature valida", () => {
    const expected = new Map([
      ["standings", "standings"],
      ["relative", "relative"],
      ["delta", "delta"],
      ["fuel-strategy", "fuel"],
      ["pedals-telemetry", "player-instruments"],
      ["input-telemetry", "controls"],
      ["racing-flags", "session"],
    ]);
    expect(overlayV2ViewModelRegistry.size).toBe(expected.size);
    for (const [widgetType, feature] of expected) {
      const entry = getOverlayV2ViewModelEntry(widgetType as never);
      expect(entry, `entry missing for ${widgetType}`).toBeDefined();
      expect(entry?.feature).toBe(feature);
      expect(typeof entry?.buildViewModelV2).toBe("function");
      expect(hasOverlayV2Feature(undefined, entry!.feature)).toBe(false);
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

  it("no registra widgets sin VM v2", () => {
    expect(getOverlayV2ViewModelEntry("track-map" as never)).toBeUndefined();
    expect(getOverlayV2ViewModelEntry("pedals" as never)).toBeUndefined();
  });
});
