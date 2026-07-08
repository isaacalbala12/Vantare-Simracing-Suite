import { describe, expect, it } from "vitest";
import type { ProfileConfig, WidgetConfig } from "../../lib/profile";
import { getOfficialDesign, listOfficialDesigns, applyOfficialDesignToProfile } from "../../hub/widgets/widget-design-gallery";
import {
  getCanonicalPreviewTelemetry,
  getCanonicalRelativeRows,
  CANONICAL_STANDINGS_COUNT,
  CANONICAL_RELATIVE_COUNT,
  CANONICAL_PLAYER_ID,
  CANONICAL_PLAYER_NAME,
  CANONICAL_PLAYER_PLACE,
  CANONICAL_STANDINGS_COLUMNS,
  CANONICAL_RELATIVE_COLUMNS,
  CANONICAL_DELTA_VALUE,
  CANONICAL_THROTTLE_VALUE,
  CANONICAL_BRAKE_VALUE,
  CANONICAL_CLUTCH_VALUE,
  applyCanonicalPreviewOverrides,
} from "./widget-preview-fixtures";

function makeWidget(type: string, variantId?: string): WidgetConfig {
  return {
    id: `${type}-test`,
    type,
    enabled: true,
    position: { x: 0, y: 0, w: 320, h: 200 },
    props: {},
    variantId,
  };
}

function makeProfile(widget: WidgetConfig): ProfileConfig {
  return {
    id: "profile-test",
    name: "Test",
    displayMode: "racing",
    monitorIndex: 0,
    widgets: [widget],
    variants: [],
  };
}

describe("widget-preview-fixtures", () => {
  describe("canonical telemetry", () => {
    it("has exactly 20 vehicles", () => {
      const telemetry = getCanonicalPreviewTelemetry();
      expect(telemetry.vehicles.length).toBe(CANONICAL_STANDINGS_COUNT);
    });

    it("has player at position 5", () => {
      const telemetry = getCanonicalPreviewTelemetry();
      const player = telemetry.vehicles.find((v) => v.isPlayer);
      expect(player).toBeDefined();
      expect(player!.id).toBe(CANONICAL_PLAYER_ID);
      expect(player!.driverName).toBe(CANONICAL_PLAYER_NAME);
      expect(player!.place).toBe(CANONICAL_PLAYER_PLACE);
    });

    it("all vehicles are HYPERCAR class", () => {
      const telemetry = getCanonicalPreviewTelemetry();
      for (const v of telemetry.vehicles) {
        expect(v.vehicleClass).toBe("HYPERCAR");
      }
    });

    it("has exactly one fastest lap", () => {
      const telemetry = getCanonicalPreviewTelemetry();
      const fastest = telemetry.vehicles.filter((v) => v.fastestLap);
      expect(fastest.length).toBe(1);
      expect(fastest[0].driverName).toBe("FERRARI AF");
    });

    it("vehicles are sorted by place 1-20", () => {
      const telemetry = getCanonicalPreviewTelemetry();
      const places = telemetry.vehicles.map((v) => v.place);
      expect(places).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
    });
  });

  describe("canonical relative rows", () => {
    it("derives exactly 5 rows from the canonical fixture", () => {
      const rows = getCanonicalRelativeRows();
      expect(rows.length).toBe(CANONICAL_RELATIVE_COUNT);
    });

    it("player is in the middle (index 2)", () => {
      const rows = getCanonicalRelativeRows();
      const playerRow = rows[2];
      expect(playerRow.isPlayer).toBe(true);
      expect(playerRow.driverName).toBe(CANONICAL_PLAYER_NAME);
    });

    it("2 cars ahead of player", () => {
      const rows = getCanonicalRelativeRows();
      expect(rows[0].timeGapToPlayer).toBeGreaterThan(0);
      expect(rows[1].timeGapToPlayer).toBeGreaterThan(0);
    });

    it("2 cars behind player", () => {
      const rows = getCanonicalRelativeRows();
      expect(rows[3].timeGapToPlayer).toBeLessThan(0);
      expect(rows[4].timeGapToPlayer).toBeLessThan(0);
    });

    it("ahead cars are FERRARI AF and CADILLAC RACING", () => {
      const rows = getCanonicalRelativeRows();
      expect(rows[0].driverName).toBe("FERRARI AF");
      expect(rows[1].driverName).toBe("CADILLAC RACING");
    });

    it("behind cars are PEUGEOT and AF CORSE", () => {
      const rows = getCanonicalRelativeRows();
      expect(rows[3].driverName).toBe("PEUGEOT");
      expect(rows[4].driverName).toBe("AF CORSE");
    });
  });

  describe("canonical columns", () => {
    it("standings has 6 semantic columns", () => {
      expect(CANONICAL_STANDINGS_COLUMNS.length).toBe(6);
    });

    it("standings columns include position, driverNumber, driverName, gap, bestLap, lastLap", () => {
      const ids = CANONICAL_STANDINGS_COLUMNS.map((c) => c.id);
      expect(ids).toEqual(["position", "driverNumber", "driverName", "gap", "bestLap", "lastLap"]);
    });

    it("all standings columns are enabled", () => {
      for (const col of CANONICAL_STANDINGS_COLUMNS) {
        expect(col.enabled).toBe(true);
      }
    });

    it("relative has 6 semantic columns", () => {
      expect(CANONICAL_RELATIVE_COLUMNS.length).toBe(6);
    });

    it("relative columns include position, class, carNumber, driverName, gap, bestLap", () => {
      const ids = CANONICAL_RELATIVE_COLUMNS.map((c) => c.id);
      expect(ids).toEqual(["position", "class", "carNumber", "driverName", "gap", "bestLap"]);
    });

    it("all relative columns are enabled", () => {
      for (const col of CANONICAL_RELATIVE_COLUMNS) {
        expect(col.enabled).toBe(true);
      }
    });
  });

  describe("canonical delta/pedals values", () => {
    it("delta value is -0.150", () => {
      expect(CANONICAL_DELTA_VALUE).toBe(-0.150);
    });

    it("pedals values are throttle=78, brake=12, clutch=0", () => {
      expect(CANONICAL_THROTTLE_VALUE).toBe(78);
      expect(CANONICAL_BRAKE_VALUE).toBe(12);
      expect(CANONICAL_CLUTCH_VALUE).toBe(0);
    });
  });

  describe("applyCanonicalPreviewOverrides", () => {
    it("returns unchanged profile for non-official widget", () => {
      const widget = makeWidget("standings");
      const profile = makeProfile(widget);
      const result = applyCanonicalPreviewOverrides(profile, widget);
      expect(result).toEqual(profile);
    });

    it("overrides columns for official standings design", () => {
      const design = getOfficialDesign("standings-leaderboard")!;
      const widget = makeWidget("standings");
      let profile = makeProfile(widget);
      profile = applyOfficialDesignToProfile(profile, widget.id, design);
      const updatedWidget = profile.widgets[0];
      const result = applyCanonicalPreviewOverrides(profile, updatedWidget);
      const variant = result.variants?.find((v) => v.id === updatedWidget.variantId);
      expect(variant).toBeDefined();
      const colIds = variant!.columns!.map((c) => c.id);
      expect(colIds).toEqual(["position", "driverNumber", "driverName", "gap", "bestLap", "lastLap"]);
    });
    it("overrides columns and filters for official relative design", () => {
      const design = getOfficialDesign("broadcast-pro")!;
      const widget = makeWidget("relative");
      let profile = makeProfile(widget);
      profile = applyOfficialDesignToProfile(profile, widget.id, design);
      const updatedWidget = profile.widgets[0];
      const result = applyCanonicalPreviewOverrides(profile, updatedWidget);
      const variant = result.variants?.find((v) => v.id === updatedWidget.variantId);
      expect(variant).toBeDefined();
      const colIds = variant!.columns!.map((c) => c.id);
      expect(colIds).toEqual(["position", "class", "carNumber", "driverName", "gap", "bestLap"]);
      expect(variant!.filters).toEqual({
        rangeAhead: 2,
        rangeBehind: 2,
        classScope: "all",
        includePlayer: true,
        rowHeightMode: "fill",
      });
    });

    it("does not override position/x/y/w/h", () => {
      const widget = makeWidget("standings", "official-standings-leaderboard-test");
      widget.position = { x: 100, y: 200, w: 400, h: 500 };
      const profile = makeProfile(widget);
      const result = applyCanonicalPreviewOverrides(profile, widget);
      const resultWidget = result.widgets[0];
      expect(resultWidget.position).toEqual({ x: 100, y: 200, w: 400, h: 500 });
    });
  });

  describe("parity across official standings designs", () => {
    it("all official standings designs use the same semantic columns after override", () => {
      const designs = listOfficialDesigns("standings");
      expect(designs.length).toBeGreaterThan(0);

      const expectedColIds = CANONICAL_STANDINGS_COLUMNS.map((c) => c.id);

      for (const design of designs) {
        const widget = makeWidget("standings");
        let profile = makeProfile(widget);
        profile = applyOfficialDesignToProfile(profile, widget.id, design);
        const updatedWidget = profile.widgets[0];
        profile = applyCanonicalPreviewOverrides(profile, updatedWidget);
        const variant = profile.variants?.find((v) => v.id === updatedWidget.variantId);
        expect(variant).toBeDefined();
        const colIds = variant!.columns!.map((c) => c.id);
        expect(colIds).toEqual(expectedColIds);
      }
    });

    it("all official standings designs enable the same columns after override", () => {
      const designs = listOfficialDesigns("standings");
      for (const design of designs) {
        const widget = makeWidget("standings");
        let profile = makeProfile(widget);
        profile = applyOfficialDesignToProfile(profile, widget.id, design);
        const updatedWidget = profile.widgets[0];
        profile = applyCanonicalPreviewOverrides(profile, updatedWidget);
        const variant = profile.variants?.find((v) => v.id === updatedWidget.variantId);
        for (const col of variant!.columns!) {
          expect(col.enabled).toBe(true);
        }
      }
    });
  });

  describe("parity across official relative designs", () => {
    it("all official relative designs use the same semantic columns after override", () => {
      const designs = listOfficialDesigns("relative");
      expect(designs.length).toBeGreaterThan(0);

      const expectedColIds = CANONICAL_RELATIVE_COLUMNS.map((c) => c.id);

      for (const design of designs) {
        const widget = makeWidget("relative");
        let profile = makeProfile(widget);
        profile = applyOfficialDesignToProfile(profile, widget.id, design);
        const updatedWidget = profile.widgets[0];
        profile = applyCanonicalPreviewOverrides(profile, updatedWidget);
        const variant = profile.variants?.find((v) => v.id === updatedWidget.variantId);
        expect(variant).toBeDefined();
        const colIds = variant!.columns!.map((c) => c.id);
        expect(colIds).toEqual(expectedColIds);
      }
    });

    it("all official relative designs use canonical filters after override", () => {
      const designs = listOfficialDesigns("relative");
      for (const design of designs) {
        const widget = makeWidget("relative");
        let profile = makeProfile(widget);
        profile = applyOfficialDesignToProfile(profile, widget.id, design);
        const updatedWidget = profile.widgets[0];
        profile = applyCanonicalPreviewOverrides(profile, updatedWidget);
        const variant = profile.variants?.find((v) => v.id === updatedWidget.variantId);
        expect(variant!.filters).toEqual({
          rangeAhead: 2,
          rangeBehind: 2,
          classScope: "all",
          includePlayer: true,
          rowHeightMode: "fill",
        });
      }
    });
  });

  describe("regression: base and vantare-crystal official designs keep distinct visual identity", () => {
    it("does not collapse base and vantare-crystal to the same themeId", () => {
      const baseDesign = getOfficialDesign("standings-leaderboard")!;
      const glassDesign = getOfficialDesign("standings-vantare-crystal")!;

      const baseWidget = makeWidget("standings");
      let baseProfile = makeProfile(baseWidget);
      baseProfile = applyOfficialDesignToProfile(baseProfile, baseWidget.id, baseDesign);
      const baseUpdated = baseProfile.widgets[0];
      baseProfile = applyCanonicalPreviewOverrides(baseProfile, baseUpdated);
      const baseVariant = baseProfile.variants?.find((v) => v.id === baseUpdated.variantId);

      const glassWidget = makeWidget("standings");
      let glassProfile = makeProfile(glassWidget);
      glassProfile = applyOfficialDesignToProfile(glassProfile, glassWidget.id, glassDesign);
      const glassUpdated = glassProfile.widgets[0];
      glassProfile = applyCanonicalPreviewOverrides(glassProfile, glassUpdated);
      const glassVariant = glassProfile.variants?.find((v) => v.id === glassUpdated.variantId);

      expect(baseVariant).toBeDefined();
      expect(glassVariant).toBeDefined();
      expect(baseVariant?.themeId).not.toBe("vantare-crystal");
      expect(glassVariant?.themeId).toBe("vantare-crystal");
      expect(glassVariant?.templateId).toBeTruthy();
    });
  });
});
