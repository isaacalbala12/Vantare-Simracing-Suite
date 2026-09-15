import { describe, expect, it } from "vitest";
import { resolveFunctionalColumnWidth, resolveFunctionalStandingsSize, resolveFunctionalHeaderInfoPlacement } from "./functional-standings-layout";
import type { WidgetColumnV3 } from "../shared/widget-column";

const columns: WidgetColumnV3[] = ["position", "driverName", "gap"].map(metricId => ({ id: metricId, metricId, enabled: true, widthPreset: "sm" }));

describe("Efficiency session geometry", () => {
  it.each(["signature", "broadcast"])("reserves exactly the thin footer height in %s without altering columns", templateId => {
    const noFooter = resolveFunctionalStandingsSize(columns, 10, { templateId, showSessionFooter: false });
    expect(resolveFunctionalStandingsSize(columns, 10, { templateId })).toEqual({ width: noFooter.width, height: noFooter.height + 22 });
  });

  it("keeps the wide Signature combined header at 50 px with configurable information", () => {
    const wide = [...columns, { id: "lap", metricId: "bestLap", enabled: true, widthPreset: "sm" as const }];
    // ISA-1221: con las columnas métricas compactas, 2 infos ya no caben junto a la cabecera y caen a la banda de 22 px.
    expect(resolveFunctionalStandingsSize(wide, 10, { headerFirst: "trackTemperature", headerSecond: "estimatedLaps" }).height).toBe(394);
  });

  it.each(["signature", "broadcast"])("keeps selected header information visible in narrow %s layouts", templateId => {
    const compact = columns.slice(0, 2);
    expect(resolveFunctionalHeaderInfoPlacement(compact, { templateId })).toBe("band");
    const hidden = resolveFunctionalStandingsSize(compact, 10, { templateId, headerFirst: "none", headerSecond: "none" });
    expect(resolveFunctionalStandingsSize(compact, 10, { templateId }).height).toBe(hidden.height + 22);
    expect(resolveFunctionalHeaderInfoPlacement(columns, { templateId })).toBe("band");
    expect(resolveFunctionalHeaderInfoPlacement(compact, { templateId, showSessionHeader: false })).toBe("none");
    expect(resolveFunctionalHeaderInfoPlacement(compact, { templateId, headerFirst: "none", headerSecond: "none" })).toBe("none");
  });

  it("keeps timing columns compact so the right-side cluster does not reopen lateral voids (ISA-1221)", () => {
    // Contenido más ancho medido: "+88.700 s" ≈ 63 px y "ÚLT. VUELTA" ≈ 62 px; con 20 px de padding el mínimo legible ronda 84 px.
    for (const metricId of ["gap", "interval", "bestLap", "lastLap", "pit"]) {
      expect(resolveFunctionalColumnWidth({ id: metricId, metricId, enabled: true, widthPreset: "sm" })).toBeLessThanOrEqual(88);
    }
  });
});
