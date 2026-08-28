import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_OVERLAY_V2_FEATURES,
  readDiagnosticOverlayV2Features,
  readOverlayV2Rollback,
  writeOverlayV2Rollback,
} from "./overlay-v2-features";

afterEach(() => {
  writeOverlayV2Rollback(false);
  delete window.__vantareOverlayV2Features;
  vi.restoreAllMocks();
});

describe("Overlay V2 rollback diagnóstico", () => {
  it("mantiene todo V2 activo por defecto", () => {
    expect(readOverlayV2Rollback()).toBe(false);
    expect(readDiagnosticOverlayV2Features()).toEqual(DEFAULT_OVERLAY_V2_FEATURES);
  });

  it("desactiva V2 solo en memoria y emite el cambio", () => {
    const listener = vi.fn();
    window.addEventListener("vantare:overlay-v2-rollback-changed", listener);

    writeOverlayV2Rollback(true);

    expect(readOverlayV2Rollback()).toBe(true);
    expect(readDiagnosticOverlayV2Features()).toEqual([]);
    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener("vantare:overlay-v2-rollback-changed", listener);
  });

  it("no consulta localStorage y la antigua lista por widget es inerte", () => {
    const getItem = vi.spyOn(Storage.prototype, "getItem");
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    window.__vantareOverlayV2Features = [];

    expect(readDiagnosticOverlayV2Features()).toEqual(DEFAULT_OVERLAY_V2_FEATURES);
    writeOverlayV2Rollback(true);

    expect(getItem).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
  });
});
