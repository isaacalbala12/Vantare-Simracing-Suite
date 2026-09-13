import { describe, expect, it } from "vitest";
import { resolveFunctionalStandingsSize, resolveFunctionalHeaderInfoPlacement } from "./functional-standings-layout";
import type { WidgetColumnV3 } from "../shared/widget-column";

const columns: WidgetColumnV3[] = ["position", "driverName", "gap"].map(metricId => ({ id: metricId, metricId, enabled: true, widthPreset: "sm" }));

describe("Efficiency session geometry", () => {
  it.each(["signature", "broadcast"])("reserves exactly the thin footer height in %s without altering columns", templateId => {
    const noFooter = resolveFunctionalStandingsSize(columns, 10, { templateId, showSessionFooter: false });
    expect(resolveFunctionalStandingsSize(columns, 10, { templateId })).toEqual({ width: noFooter.width, height: noFooter.height + 22 });
  });

  it("keeps the wide Signature combined header at 50 px with configurable information", () => {
    const wide = [...columns, { id: "lap", metricId: "bestLap", enabled: true, widthPreset: "sm" as const }];
    expect(resolveFunctionalStandingsSize(wide, 10, { headerFirst: "trackTemperature", headerSecond: "estimatedLaps" }).height).toBe(372);
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
});
