import { describe, expect, it } from "vitest";
import {
  fitStandingsRowsToHeight,
  measureStandingsFlowHeight,
} from "./standings-endurance-layout";
import type { StandingsRowViewModel } from "../../../widget-types/standings/standings-view-model";

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

    expect(fitted).toHaveLength(14);
    expect(fitted.at(-1)?.id).toBe("hy-14");
  });

  it.each([
    { state: "battle box", ghostRows: 0, battleBoxes: 1 },
    { state: "retirement ghost", ghostRows: 1, battleBoxes: 0 },
    { state: "battle plus retirement", ghostRows: 1, battleBoxes: 1 },
  ])("keeps Redline inside 560px during $state", ({ ghostRows, battleBoxes }) => {
    const rows = Array.from({ length: 18 }, (_, index) => ({
      id: `hy-${index + 1}`,
      vehicleClass: "HYPERCAR",
      isPlayer: index === 8,
    })) as unknown as StandingsRowViewModel[];
    const fitted = fitStandingsRowsToHeight(rows, {
      templateId: "standings-redline",
      viewportHeight: 560,
      showSessionHeader: true,
    });

    expect(measureStandingsFlowHeight({
      templateId: "standings-redline",
      rowCount: fitted.length + ghostRows,
      groupCount: 1,
      showSessionHeader: true,
      battleBoxCount: battleBoxes,
    })).toBeLessThanOrEqual(560);
  });

  it("fits battle plus ghost at the 534px boundary with full box geometry", () => {
    const rows = Array.from({ length: 18 }, (_, index) => ({
      id: `boundary-${index}`,
      vehicleClass: "HYPERCAR",
      isPlayer: index === 7,
    })) as unknown as StandingsRowViewModel[];
    const fitted = fitStandingsRowsToHeight(rows, {
      templateId: "standings-redline",
      viewportHeight: 534,
      showSessionHeader: true,
    });

    expect(fitted).toHaveLength(13);
    expect(measureStandingsFlowHeight({
      templateId: "standings-redline",
      rowCount: fitted.length + 1,
      groupCount: 1,
      showSessionHeader: true,
      battleBoxCount: 1,
    })).toBeLessThanOrEqual(534);
  });

});
