import { describe, expect, it } from "vitest";
import { resolveFunctionalColumnWidth, resolveFunctionalStandingsSize, resolveFunctionalHeaderInfoPlacement } from "./functional-standings-layout";
import type { WidgetColumnV3 } from "../shared/widget-column";

const columns: WidgetColumnV3[] = ["position", "driverName", "gap"].map(metricId => ({ id: metricId, metricId, enabled: true, widthPreset: "sm" }));

describe("Efficiency session geometry", () => {
  it.each(["signature", "broadcast"])("reserves exactly the configured session footer height in %s without altering columns", templateId => {
    const noFooter = resolveFunctionalStandingsSize(columns, 10, { templateId, showSessionFooter: false });
    expect(resolveFunctionalStandingsSize(columns, 10, { templateId })).toEqual({ width: noFooter.width, height: noFooter.height + 22 });
  });

  it("keeps a single session header without the former numeric info band", () => {
    const wide = [...columns, { id: "lap", metricId: "bestLap", enabled: true, widthPreset: "sm" as const }];
    // ISA-1221: la cabecera de sesión mide 42px, las filas 300px y el pie
    // configurable 22px. No se reserva una segunda banda de 22px.
    expect(resolveFunctionalStandingsSize(wide, 10, { headerFirst: "trackTemperature", headerSecond: "estimatedLaps" }).height).toBe(392);
  });

  it.each(["signature", "broadcast"])("removes the upper info band from %s layouts", templateId => {
    const compact = columns.slice(0, 2);
    const configured = resolveFunctionalStandingsSize(compact, 10, { templateId, headerFirst: "trackTemperature", headerSecond: "airTemperature" });
    const hidden = resolveFunctionalStandingsSize(compact, 10, { templateId, headerFirst: "none", headerSecond: "none" });
    expect(resolveFunctionalHeaderInfoPlacement(compact, { templateId })).toBe("none");
    expect(resolveFunctionalHeaderInfoPlacement(columns, { templateId })).toBe("none");
    expect(configured).toEqual(hidden);
    expect(resolveFunctionalHeaderInfoPlacement(compact, { templateId, showSessionHeader: false })).toBe("none");
  });

  it("does not reserve a standalone Pit column", () => {
    const withPit = [...columns, { id: "pit", metricId: "pit", enabled: true, widthPreset: "sm" as const }];
    expect(resolveFunctionalStandingsSize(withPit, 10, { templateId: "signature" })).toEqual(
      resolveFunctionalStandingsSize(columns, 10, { templateId: "signature" }),
    );
  });

  it("keeps every standings metric in the compact width budget (ISA-1221)", () => {
    const expected = {
      position: 30,
      driverNumber: 30,
      driverName: 188,
      vehicleClass: 54,
      gap: 86,
      interval: 76,
      currentLap: 48,
      lastLap: 76,
      bestLap: 76,
      pit: 32,
      tireCompound: 44,
    } as const;
    for (const [metricId, width] of Object.entries(expected)) {
      expect(resolveFunctionalColumnWidth({ id: metricId, metricId, enabled: true, widthPreset: "sm" })).toBe(width);
    }
  });

  it("narrows the driver name column when the name format shortens the text", () => {
    const name = (mode: string, broadcast = false) =>
      resolveFunctionalColumnWidth(
        { id: "driverName", metricId: "driverName", enabled: true, widthPreset: "sm", format: { mode } },
        broadcast,
      );
    expect(name("full")).toBe(188);
    expect(name("initial")).toBe(140);
    expect(name("surname")).toBe(124);
    expect(name("full", true)).toBe(208);
    expect(name("initial", true)).toBe(160);
    expect(name("surname", true)).toBe(144);
    // truncate deriva del presupuesto de caracteres (≈8.4 px/carácter + padding).
    expect(name("truncate")).toBe(158);
  });

  it("keeps the session header in the same composition when a short name narrows the text", () => {
    const wide = ["position", "driverNumber", "driverName", "gap"].map(metricId =>
      ({ id: metricId, metricId, enabled: true, widthPreset: "sm" as const }));
    const short = wide.map((column) =>
      column.metricId === "driverName" ? { ...column, format: { mode: "surname" } } : column);
    const wideSize = resolveFunctionalStandingsSize(wide, 10, { templateId: "signature" });
    const narrowSize = resolveFunctionalStandingsSize(short, 10, { templateId: "signature" });
    expect(narrowSize.width).toBe(wideSize.width - 64);
    // El formato visible no puede cambiar la estructura de la cabecera ni
    // crear una banda nueva bajo ella.
    expect(narrowSize.height).toBe(wideSize.height);
  });
});
