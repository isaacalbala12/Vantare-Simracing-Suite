import { describe, expect, it } from "vitest";

import { createDefaultStrategyEditorDocument } from "./strategy-editor";
import {
  clearLapCorrection,
  clearQuickCorrection,
  correctLapValue,
  correctQuickValue,
  effectiveLapRows,
  effectiveValue,
  parseStrategyManualInputs,
} from "./strategy-manual-input";

describe("Strategy manual inputs", () => {
  it("keeps original values immutable while applying and clearing quick corrections", () => {
    const document = createDefaultStrategyEditorDocument();
    const original = document.manualInputs.quick.fuelPerLapLitres;
    const corrected = correctQuickValue(
      document,
      "fuelPerLapLitres",
      4.6,
      "Promedio revisado",
      "2026-08-02T10:00:00Z",
    );

    expect(corrected.manualInputs.quick.fuelPerLapLitres.original).toBe(original.original);
    expect(effectiveValue(corrected.manualInputs.quick.fuelPerLapLitres)).toBe(4.6);
    expect(corrected.manualInputs.quick.fuelPerLapLitres.correction).toMatchObject({
      value: 4.6,
      reason: "Promedio revisado",
    });
    expect(document.manualInputs.quick.fuelPerLapLitres).toEqual(original);

    const restored = clearQuickCorrection(corrected, "fuelPerLapLitres");
    expect(restored.manualInputs.quick.fuelPerLapLitres).toEqual({ original: 4.8 });
    expect(effectiveValue(restored.manualInputs.quick.fuelPerLapLitres)).toBe(4.8);
  });

  it("creates sparse per-lap corrections without mutating the average", () => {
    const document = createDefaultStrategyEditorDocument();
    const corrected = correctLapValue(
      document,
      2,
      "fuelPerLapLitres",
      5.1,
      "Vuelta con tráfico",
      "2026-08-02T10:00:00Z",
    );
    const rows = effectiveLapRows(corrected);

    expect(rows).toHaveLength(78);
    expect(rows[0].fuelPerLapLitres.value).toBe(4.8);
    expect(rows[1].fuelPerLapLitres).toMatchObject({
      original: 4.8,
      value: 5.1,
      corrected: true,
    });
    expect(effectiveValue(corrected.manualInputs.quick.fuelPerLapLitres)).toBe(4.8);

    const cleared = clearLapCorrection(corrected, 2, "fuelPerLapLitres");
    expect(effectiveLapRows(cleared)[1].fuelPerLapLitres.value).toBe(4.8);
    expect(cleared.manualInputs.lapCorrections).toHaveLength(0);
  });

  it("validates units, ranges, lap numbers and correction timestamps", () => {
    const document = structuredClone(createDefaultStrategyEditorDocument());
    document.manualInputs.quick.virtualEnergyPerLapPercent.original = 101;
    expect(() => parseStrategyManualInputs(document.manualInputs, 78)).toThrowError(
      expect.objectContaining({ code: "invalid_manual_input" }),
    );

    const invalidLap = structuredClone(createDefaultStrategyEditorDocument());
    invalidLap.manualInputs.lapCorrections.push({
      lapNumber: 79,
      fuelPerLapLitres: {
        original: 4.8,
        correction: { value: 4.7, reason: "Fuera", correctedAt: "2026-08-02T10:00:00Z" },
      },
    });
    expect(() => parseStrategyManualInputs(invalidLap.manualInputs, 78)).toThrow();
  });
});
