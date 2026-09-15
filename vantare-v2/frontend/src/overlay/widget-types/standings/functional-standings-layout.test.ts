import { describe, expect, it } from "vitest";
import { resolveFunctionalColumnWidth, resolveFunctionalStandingsSize, resolveFunctionalHeaderInfoPlacement } from "./functional-standings-layout";
import type { WidgetColumnV3 } from "../shared/widget-column";

const columns: WidgetColumnV3[] = ["position", "driverName", "gap"].map(metricId => ({ id: metricId, metricId, enabled: true, widthPreset: "sm" }));

describe("Efficiency session geometry", () => {
  it.each(["signature", "broadcast"])("reserves exactly the ambient footer height in %s without altering columns", templateId => {
    const noFooter = resolveFunctionalStandingsSize(columns, 10, { templateId, showSessionFooter: false });
    expect(resolveFunctionalStandingsSize(columns, 10, { templateId })).toEqual({ width: noFooter.width, height: noFooter.height + 30 });
  });

  it("keeps the wide Signature combined header at 50 px with configurable information", () => {
    const wide = [...columns, { id: "lap", metricId: "bestLap", enabled: true, widthPreset: "sm" as const }];
    // ISA-1221: con las columnas métricas compactas, 2 infos ya no caben junto a la cabecera y caen a la banda de 22 px.
    expect(resolveFunctionalStandingsSize(wide, 10, { headerFirst: "trackTemperature", headerSecond: "estimatedLaps" }).height).toBe(402);
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

  it("narrows the driver name column when the name format shortens the text", () => {
    const name = (mode: string, broadcast = false) =>
      resolveFunctionalColumnWidth(
        { id: "driverName", metricId: "driverName", enabled: true, widthPreset: "sm", format: { mode } },
        broadcast,
      );
    expect(name("full")).toBe(204);
    expect(name("initial")).toBe(152);
    expect(name("surname")).toBe(128);
    expect(name("full", true)).toBe(224);
    expect(name("initial", true)).toBe(172);
    expect(name("surname", true)).toBe(148);
    // truncate deriva del presupuesto de caracteres (≈8.4 px/carácter + padding).
    expect(name("truncate")).toBe(158);
  });

  it("moves the session header to its own band when a short name narrows the identity prefix", () => {
    const short = columns.map((column) =>
      column.metricId === "driverName" ? { ...column, format: { mode: "surname" } } : column);
    const wide = resolveFunctionalStandingsSize(columns, 10, { templateId: "signature" });
    const narrow = resolveFunctionalStandingsSize(short, 10, { templateId: "signature" });
    expect(narrow.width).toBe(wide.width - 76);
    // El prefijo pos+nombre (162 px) ya no sostiene la cabecera: banda de 49 px.
    expect(narrow.height).toBe(wide.height + 49);
  });
});
