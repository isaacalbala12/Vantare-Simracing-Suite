import { describe, expect, it } from "vitest";
import type { ProfileConfig, WidgetConfig } from "./profile";
import {
  enrichWidgetPropsWithVariant,
  findWidgetVariant,
  toggleRelativeColumn,
  toggleStandingsColumn,
  withDefaultWidgetVariants,
} from "./widget-variants";

function relativeWidget(): WidgetConfig {
  return {
    id: "relative",
    type: "relative",
    variantId: "variant-relative-default",
    enabled: true,
    updateHz: 15,
    position: { x: 40, y: 600, w: 320, h: 280 },
    props: { rangeAhead: 3, rangeBehind: 3, style: "vantare-racing" },
  };
}

function profile(): ProfileConfig {
  return {
    schemaVersion: 2,
    id: "v2",
    displayMode: "edit",
    monitorIndex: 0,
    widgets: [relativeWidget()],
    variants: [
      {
        id: "variant-relative-default",
        widgetType: "relative",
        templateId: "relative-vantare-default",
        themeId: "vantare-racing",
        name: "Relative Default",
      },
    ],
  };
}

function standingsWidget(): WidgetConfig {
  return {
    id: "standings",
    type: "standings",
    variantId: "variant-standings-default",
    enabled: true,
    updateHz: 15,
    position: { x: 40, y: 80, w: 360, h: 360 },
    props: { style: "vantare-racing" },
  };
}

function standingsProfile(): ProfileConfig {
  return {
    schemaVersion: 2,
    id: "standings-v2",
    displayMode: "edit",
    monitorIndex: 0,
    widgets: [standingsWidget()],
    variants: [
      {
        id: "variant-standings-default",
        widgetType: "standings",
        templateId: "standings-vantare-default",
        themeId: "vantare-racing",
        name: "Standings Default",
      },
    ],
  };
}

describe("widget variants", () => {
  it("finds the selected widget variant", () => {
    const p = profile();

    expect(findWidgetVariant(p, p.widgets[0])?.id).toBe("variant-relative-default");
  });

  it("adds default Relative columns without changing widget position", () => {
    const p = withDefaultWidgetVariants(profile());
    const variant = p.variants?.[0];

    expect(p.widgets[0].position).toEqual({ x: 40, y: 600, w: 320, h: 280 });
    expect(variant?.columns?.map((column) => [column.id, column.enabled])).toEqual([
      ["position", true],
      ["class", true],
      ["carNumber", true],
      ["driverName", true],
      ["gap", true],
      ["bestLap", false],
      ["lastLap", false],
    ]);
  });

  it("toggles a Relative optional column in the variant only", () => {
    const p = withDefaultWidgetVariants(profile());
    const next = toggleRelativeColumn(p, "relative", "bestLap", true);

    expect(next.widgets[0].position).toEqual(p.widgets[0].position);
    expect(next.widgets[0].props).toEqual(p.widgets[0].props);
    expect(next.variants?.[0].columns?.find((column) => column.id === "bestLap")?.enabled).toBe(true);
  });

  it("enriches widget props with variant columns for renderers", () => {
    const p = toggleRelativeColumn(withDefaultWidgetVariants(profile()), "relative", "lastLap", true);
    const props = enrichWidgetPropsWithVariant(p, p.widgets[0]);

    expect(props.rangeAhead).toBe(3);
    expect(props.style).toBe("vantare-racing");
    expect(props.variant?.templateId).toBe("relative-vantare-default");
    expect(props.variant?.columns.find((column) => column.id === "lastLap")?.enabled).toBe(true);
  });

  it("ignores unknown column toggles", () => {
    const p = withDefaultWidgetVariants(profile());
    const next = toggleRelativeColumn(p, "relative", "unknown", true);

    expect(next).toBe(p);
  });

  it("handles legacy profiles without schemaVersion, variantId or variants", () => {
    const legacyProfile: ProfileConfig = {
      displayMode: "racing",
      monitorIndex: 0,
      widgets: [
        {
          id: "relative",
          type: "relative",
          enabled: true,
          updateHz: 15,
          position: { x: 40, y: 600, w: 320, h: 280 },
          props: { rangeAhead: 3, rangeBehind: 3 },
        },
      ],
    };

    // 1. withDefaultWidgetVariants añade variantId al widget relative y crea variant con columnas default
    const normalized = withDefaultWidgetVariants(legacyProfile);
    expect(normalized.widgets[0].variantId).toBe("variant-relative-default");
    expect(normalized.variants).toHaveLength(1);
    expect(normalized.variants?.[0].id).toBe("variant-relative-default");
    expect(normalized.variants?.[0].columns).toBeDefined();
    expect(normalized.variants?.[0].columns?.find((c) => c.id === "bestLap")?.enabled).toBe(false);

    // 2. toggleRelativeColumn activa bestLap en perfil legacy
    const toggled = toggleRelativeColumn(legacyProfile, "relative", "bestLap", true);
    expect(toggled.widgets[0].variantId).toBe("variant-relative-default");
    expect(toggled.variants?.[0].columns?.find((c) => c.id === "bestLap")?.enabled).toBe(true);

    // 3. widget.position se preserva
    expect(toggled.widgets[0].position).toEqual({ x: 40, y: 600, w: 320, h: 280 });

    // 4. enrichWidgetPropsWithVariant devuelve props.variant.columns para legacy
    const props = enrichWidgetPropsWithVariant(toggled, toggled.widgets[0]);
    expect(props.variant?.columns).toBeDefined();
    expect(props.variant?.columns.find((c) => c.id === "bestLap")?.enabled).toBe(true);
  });

  it("returns the same profile object when relative variant is already normalized", () => {
    const p = withDefaultWidgetVariants(profile());

    expect(withDefaultWidgetVariants(p)).toBe(p);
  });

  it("adds default Standings columns without changing widget position or props", () => {
    const p = withDefaultWidgetVariants(standingsProfile());
    const variant = p.variants?.[0];

    expect(p.widgets[0].position).toEqual({ x: 40, y: 80, w: 360, h: 360 });
    expect(p.widgets[0].props).toEqual({ style: "vantare-racing" });
    expect(variant?.widgetType).toBe("standings");
    expect(variant?.templateId).toBe("standings-vantare-default");
    expect(variant?.columns?.map((column) => [column.id, column.enabled])).toEqual([
      ["position", true],
      ["driverNumber", true],
      ["driverName", true],
      ["gap", true],
      ["vehicleClass", false],
      ["currentLap", false],
      ["interval", false],
      ["bestLap", false],
      ["lastLap", false],
    ]);
    expect(variant?.columns?.some((column) => column.id === "playerHighlight")).toBe(false);
  });

  it("toggles a Standings optional column in the variant only", () => {
    const p = withDefaultWidgetVariants(standingsProfile());
    const next = toggleStandingsColumn(p, "standings", "bestLap", true);

    expect(next.widgets[0].position).toEqual(p.widgets[0].position);
    expect(next.widgets[0].props).toEqual(p.widgets[0].props);
    expect(next.variants?.[0].columns?.find((column) => column.id === "bestLap")?.enabled).toBe(true);
  });

  it("enriches Standings widget props with variant columns for renderers", () => {
    const p = toggleStandingsColumn(withDefaultWidgetVariants(standingsProfile()), "standings", "lastLap", true);
    const props = enrichWidgetPropsWithVariant(p, p.widgets[0]);

    expect(props.style).toBe("vantare-racing");
    expect(props.variant?.templateId).toBe("standings-vantare-default");
    expect(props.variant?.columns.find((column) => column.id === "lastLap")?.enabled).toBe(true);
  });

  it("handles legacy Standings profiles without schemaVersion, variantId or variants", () => {
    const legacyProfile: ProfileConfig = {
      displayMode: "racing",
      monitorIndex: 0,
      widgets: [
        {
          id: "standings",
          type: "standings",
          enabled: true,
          updateHz: 15,
          position: { x: 40, y: 80, w: 360, h: 360 },
          props: { style: "vantare-racing" },
        },
      ],
    };

    const toggled = toggleStandingsColumn(legacyProfile, "standings", "interval", true);

    expect(toggled.widgets[0].variantId).toBe("variant-standings-default");
    expect(toggled.widgets[0].position).toEqual({ x: 40, y: 80, w: 360, h: 360 });
    expect(toggled.variants?.[0].id).toBe("variant-standings-default");
    expect(toggled.variants?.[0].widgetType).toBe("standings");
    expect(toggled.variants?.[0].columns?.find((column) => column.id === "interval")?.enabled).toBe(true);
  });

  it("ignores unknown Standings column toggles", () => {
    const p = withDefaultWidgetVariants(standingsProfile());
    const next = toggleStandingsColumn(p, "standings", "unknown", true);

    expect(next).toBe(p);
  });

  it("preserves Standings user column format and style overrides when normalizing", () => {
    const p = standingsProfile();
    p.variants = [
      {
        id: "variant-standings-default",
        widgetType: "standings",
        templateId: "standings-vantare-default",
        columns: [
          {
            id: "driverName",
            metricId: "driverName",
            enabled: true,
            width: 220,
            format: { mode: "truncate", maxChars: 10 },
            style: { color: "#ffcc00", align: "center" },
          },
        ],
      },
    ];

    const next = withDefaultWidgetVariants(p);
    const driverName = next.variants?.[0].columns?.find((column) => column.id === "driverName");

    expect(driverName?.width).toBe(220);
    expect(driverName?.format).toEqual({ mode: "truncate", maxChars: 10 });
    expect(driverName?.style).toEqual({ color: "#ffcc00", align: "center" });
    expect(next.variants?.[0].columns?.find((column) => column.id === "bestLap")?.format).toEqual({
      display: "full",
      decimals: 3,
    });
  });

  it("returns the same profile object when Standings variant is already normalized", () => {
    const p = withDefaultWidgetVariants(standingsProfile());

    expect(withDefaultWidgetVariants(p)).toBe(p);
  });

  it("adds default Relative filters without overwriting user filters", () => {
    const p = profile();
    p.variants = [
      {
        id: "variant-relative-default",
        widgetType: "relative",
        templateId: "relative-vantare-default",
        filters: { rangeAhead: 2, classScope: "sameClass" },
        columns: [],
      },
    ];

    const next = withDefaultWidgetVariants(p);
    expect(next.variants?.[0].filters).toEqual({
      rangeAhead: 2,
      rangeBehind: 3,
      classScope: "sameClass",
      includePlayer: true,
      rowHeightMode: "fill",
    });
  });

  it("preserves user column format and style overrides when normalizing", () => {
    const p = profile();
    p.variants = [
      {
        id: "variant-relative-default",
        widgetType: "relative",
        templateId: "relative-vantare-default",
        columns: [
          {
            id: "driverName",
            metricId: "driverName",
            enabled: true,
            width: 210,
            format: { mode: "truncate", maxChars: 12 },
            style: { color: "#ffcc00", align: "center" },
          },
        ],
      },
    ];

    const next = withDefaultWidgetVariants(p);
    const driverName = next.variants?.[0].columns?.find((column) => column.id === "driverName");

    expect(driverName?.width).toBe(210);
    expect(driverName?.format).toEqual({ mode: "truncate", maxChars: 12 });
    expect(driverName?.style).toEqual({ color: "#ffcc00", align: "center" });
    expect(next.variants?.[0].columns?.find((column) => column.id === "bestLap")?.format).toEqual({
      display: "full",
      decimals: 3,
    });
  });

  // === P2: templateId behavior for non-relative/non-standings widget types ===

  it("does not force a templateId for widget types without a default template", () => {
    const p: ProfileConfig = {
      schemaVersion: 2,
      id: "mixed",
      displayMode: "edit",
      monitorIndex: 0,
      widgets: [
        {
          id: "weather",
          type: "weather",
          variantId: "variant-weather-custom",
          enabled: true,
          updateHz: 15,
          position: { x: 0, y: 0, w: 100, h: 100 },
          props: {},
        },
      ],
      variants: [
        {
          id: "variant-weather-custom",
          widgetType: "weather",
          templateId: "weather-custom",
        },
      ],
    };
    const props = enrichWidgetPropsWithVariant(p, p.widgets[0]);
    expect(props.variant?.templateId).toBe("weather-custom");
  });

  it("leaves templateId undefined for unknown widget types when variant has no templateId", () => {
    const p: ProfileConfig = {
      schemaVersion: 2,
      id: "mixed2",
      displayMode: "edit",
      monitorIndex: 0,
      widgets: [
        {
          id: "trackmap",
          type: "trackmap",
          variantId: "variant-trackmap-default",
          enabled: true,
          updateHz: 15,
          position: { x: 0, y: 0, w: 100, h: 100 },
          props: {},
        },
      ],
      variants: [
        { id: "variant-trackmap-default", widgetType: "trackmap" },
      ],
    };
    const props = enrichWidgetPropsWithVariant(p, p.widgets[0]);
    expect(props.variant?.templateId).toBeUndefined();
  });

  // === P3-5: Standings edge cases ===

  it("merges partial Standings format overrides with default format", () => {
    const p = standingsProfile();
    p.variants = [
      {
        id: "variant-standings-default",
        widgetType: "standings",
        templateId: "standings-vantare-default",
        columns: [
          {
            id: "driverName",
            metricId: "driverName",
            enabled: true,
            format: { maxChars: 8 },
          },
        ],
      },
    ];
    const next = withDefaultWidgetVariants(p);
    const driverName = next.variants?.[0].columns?.find((c) => c.id === "driverName");
    expect(driverName?.format).toEqual({ mode: "full", maxChars: 8 });
  });

  it("drops unknown Standings columns not present in the catalog", () => {
    const p = standingsProfile();
    p.variants = [
      {
        id: "variant-standings-default",
        widgetType: "standings",
        templateId: "standings-vantare-default",
        columns: [
          { id: "ghost", metricId: "ghost", enabled: true },
          { id: "position", metricId: "position", enabled: true },
        ],
      },
    ];
    const next = withDefaultWidgetVariants(p);
    const ids = next.variants?.[0].columns?.map((c) => c.id);
    expect(ids).not.toContain("ghost");
    expect(ids).toContain("position");
  });

  it("is idempotent after toggling a Standings column", () => {
    const p = withDefaultWidgetVariants(standingsProfile());
    const toggled = toggleStandingsColumn(p, "standings", "bestLap", true);
    expect(withDefaultWidgetVariants(toggled)).toBe(toggled);
  });

  it("creates a default Standings variant for legacy profiles with no variants at all", () => {
    const legacy: ProfileConfig = {
      displayMode: "racing",
      monitorIndex: 0,
      widgets: [
        {
          id: "standings-legacy",
          type: "standings",
          enabled: true,
          updateHz: 15,
          position: { x: 10, y: 10, w: 200, h: 200 },
          props: { style: "vantare-racing" },
        },
      ],
    };
    const next = withDefaultWidgetVariants(legacy);
    expect(next.widgets[0].variantId).toBe("variant-standings-legacy-default");
    expect(next.variants?.[0].id).toBe("variant-standings-legacy-default");
    expect(next.variants?.[0].widgetType).toBe("standings");
    expect(next.variants?.[0].columns?.length).toBeGreaterThan(0);
  });
});
