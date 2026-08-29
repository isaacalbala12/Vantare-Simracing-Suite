import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_OVERLAY_V2_FEATURES,
  createOverlayV2FeaturesGeneration,
  readDiagnosticOverlayV2Features,
  readOverlayV2Rollback,
  writeOverlayV2Rollback,
} from "./overlay-v2-features";

afterEach(() => {
  delete window.__vantareOverlayV2Features;
  vi.restoreAllMocks();
});

describe("Overlay V2 rollback diagnóstico", () => {
  it("mantiene todo V2 activo por defecto", () => {
    expect(readOverlayV2Rollback()).toBe(false);
    expect(readDiagnosticOverlayV2Features()).toEqual(DEFAULT_OVERLAY_V2_FEATURES);
  });

  it("desactiva V2 solo en memoria y emite el cambio", () => {
    const generation = createOverlayV2FeaturesGeneration();
    const listener = vi.fn();
    window.addEventListener("vantare:overlay-v2-rollback-changed", listener);

    writeOverlayV2Rollback(true);

    expect(readOverlayV2Rollback()).toBe(true);
    expect(readDiagnosticOverlayV2Features()).toEqual([]);
    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener("vantare:overlay-v2-rollback-changed", listener);
    generation.dispose();
  });

  it("no consulta localStorage y la antigua lista por widget es inerte", () => {
    const generation = createOverlayV2FeaturesGeneration();
    const getItem = vi.spyOn(Storage.prototype, "getItem");
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    window.__vantareOverlayV2Features = [];

    expect(readDiagnosticOverlayV2Features()).toEqual(DEFAULT_OVERLAY_V2_FEATURES);
    writeOverlayV2Rollback(true);

    expect(getItem).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
    generation.dispose();
  });

  it("restaura V2 al desmontar y recrear la generación", () => {
    const first = createOverlayV2FeaturesGeneration();
    first.setRollback(true);
    expect(first.getSnapshot()).toEqual([]);
    first.dispose();

    const second = createOverlayV2FeaturesGeneration();
    expect(second.getSnapshot()).toEqual(DEFAULT_OVERLAY_V2_FEATURES);
    expect(readOverlayV2Rollback()).toBe(false);
    second.dispose();
  });
});
