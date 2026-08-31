import { describe, expect, it } from "vitest";
import {
  fitStandingsRowsToHeight,
  type StandingsEnduranceLayoutTemplate,
} from "./standings-endurance-layout";
import type { StandingsRowViewModel } from "../../../widget-types/standings/standings-view-model";

const TEMPLATES: readonly StandingsEnduranceLayoutTemplate[] = [
  "standings-f1",
  "standings-wec",
  "standings-lmu",
  "standings-racelabs",
  "standings-apex",
  "standings-neo",
  "standings-redline",
  "standings-tower",
  "standings-strip",
];

describe("fitStandingsRowsToHeight", () => {
  it("drops the half-visible 17th Redline row at 520x560", () => {
    const rows = Array.from({ length: 18 }, (_, index) => ({
      id: `hy-${index + 1}`,
      vehicleClass: "HYPERCAR",
      isPlayer: index === 17,
    }));

    const fitted = fitStandingsRowsToHeight(rows as unknown as StandingsRowViewModel[], {
      templateId: "standings-redline",
      viewportHeight: 560,
      showSessionHeader: true,
    });

    expect(fitted).toHaveLength(16);
    expect(fitted.at(-1)?.id).toBe("hy-16");
  });

  it.each(TEMPLATES)("uses only complete rows for %s", (templateId) => {
    const rows = Array.from({ length: 40 }, (_, index) => ({
      id: `${templateId}-${index}`,
      vehicleClass: "HYPERCAR",
      isPlayer: false,
    }));

    const fitted = fitStandingsRowsToHeight(rows as unknown as StandingsRowViewModel[], {
      templateId,
      viewportHeight: 560,
      showSessionHeader: true,
    });

    expect(fitted.length).toBeGreaterThan(0);
    expect(fitted.length).toBeLessThan(rows.length);
    expect(fitted).toEqual(rows.slice(0, fitted.length));
  });
});
