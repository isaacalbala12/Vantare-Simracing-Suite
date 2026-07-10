import { describe, expect, it } from "vitest";
import type { AccessContext } from "../../../lib/access-policy";
import { DesignSystemRegistry } from "../../../overlay/core/design-system-registry";
import type { DesignSystemDefinition } from "../../../overlay/core/design-system-definition";
import { deltaDefinition } from "../../../overlay/widget-types/delta/delta-definition";
import type { CoreWidgetType, WidgetInstanceV3 } from "../../../overlay/core/profile-document";
import type { WidgetTypeDefinition } from "../../../overlay/core/widget-definition";
import { getWidgetRequiredFeature } from "../../../overlay/core/widget-definition";
import { WidgetTypeRegistry } from "../../../overlay/core/widget-registry";
import {
  buildAddWidgetCommand,
  canAddCatalogEntry,
  computeNextZIndex,
  createIsolatedCatalogDeps,
  createNextWidgetId,
  deriveStudioCatalog,
} from "./studio-catalog";

const freeAccess: AccessContext = {
  planLabel: "free",
  planStatus: "active",
  roles: [],
  isBlocked: false,
  isUnconfigured: false,
};

const paidAccess: AccessContext = {
  planLabel: "paid_overlays",
  planStatus: "active",
  roles: [],
  isBlocked: false,
  isUnconfigured: false,
};

function stubRenderer(): React.ReactElement {
  return null;
}

function createStubDefinition(type: CoreWidgetType): WidgetTypeDefinition<Record<string, never>> {
  return {
    type,
    labelKey: `overlay.widgets.${type}`,
    capabilities: {
      inspectorSections: ["design", "behavior", "layout", "actions"],
      supportsAspectUnlock: type !== "delta",
      minimumSize: { width: 120, height: 48 },
      defaultSize: { width: 280, height: 96 },
      requiredFeature: getWidgetRequiredFeature(type),
    },
    inspector: { content: [] },
    createDefault(id: string): WidgetInstanceV3 {
      return {
        id,
        type,
        layout: { x: 64, y: 64, w: 280, h: 96, zIndex: 0, aspectLocked: true },
        behavior: { enabled: true, updateHz: 30 },
        content: {},
        visual: {
          systemId: "vantare-original",
          systemVersion: 1,
          configVersion: 1,
          baseSettings: {},
          appearanceOverrides: {},
        },
      };
    },
    parseContent() {
      return {};
    },
    buildViewModel() {
      return { type, status: "ready" as const };
    },
  };
}

function createTestDesignSystem(widgetTypes: readonly CoreWidgetType[]): DesignSystemDefinition {
  return {
    id: "vantare-original",
    version: 1,
    label: "Vantare Original",
    systemMigrations: {
      0: (_widgetType, settings) => ({ ...settings }),
    },
    widgets: widgetTypes.map((widgetType) => ({
      widgetType,
      configVersion: 1,
      defaultSettings: {},
      configMigrations: {},
      parseSettings() {
        return {};
      },
      inspector: { appearance: [] },
      Renderer: stubRenderer,
    })),
  };
}

describe("deriveStudioCatalog", () => {
  it("returns only registered widget types from the canonical registry", () => {
    const catalog = deriveStudioCatalog();
    expect(catalog.map((entry) => entry.type)).toEqual(["delta"]);
    expect(catalog[0]).toMatchObject({
      labelKey: "overlay.widgets.delta",
      defaultSize: { width: 280, height: 96 },
      requiredFeature: "overlays.basic",
    });
    expect(catalog[0]?.compatibleSystems).toEqual([
      { systemId: "vantare-crystal", systemVersion: 1, label: "Vantare Crystal" },
      { systemId: "vantare-original", systemVersion: 1, label: "Vantare Original" },
    ]);
  });

  it("derives exactly the four core widgets from an isolated registry without legacy entries", () => {
    const widgetRegistry = new WidgetTypeRegistry();
    widgetRegistry.register(deltaDefinition);
    widgetRegistry.register(createStubDefinition("standings"));
    widgetRegistry.register(createStubDefinition("relative"));
    widgetRegistry.register(createStubDefinition("pedals"));

    const designRegistry = new DesignSystemRegistry();
    designRegistry.register(createTestDesignSystem(["delta", "standings", "relative", "pedals"]));

    const catalog = deriveStudioCatalog(createIsolatedCatalogDeps(widgetRegistry, designRegistry));
    expect(catalog.map((entry) => entry.type)).toEqual(["delta", "pedals", "relative", "standings"]);
    expect(catalog.find((entry) => entry.type === "relative")?.requiredFeature).toBe("overlays.advanced");
    expect(catalog.find((entry) => entry.type === "standings")?.inspectorSections).toContain("layout");
  });
});

describe("catalog access", () => {
  it("allows free users to add basic widgets and blocks advanced widgets", () => {
    const delta = deriveStudioCatalog().find((entry) => entry.type === "delta");
    expect(delta).toBeDefined();
    expect(canAddCatalogEntry(freeAccess, delta!)).toBe(true);

    const widgetRegistry = new WidgetTypeRegistry();
    widgetRegistry.register(createStubDefinition("relative"));
    const designRegistry = new DesignSystemRegistry();
    designRegistry.register(createTestDesignSystem(["relative"]));
    const relative = deriveStudioCatalog(createIsolatedCatalogDeps(widgetRegistry, designRegistry))[0]!;
    expect(canAddCatalogEntry(freeAccess, relative)).toBe(false);
    expect(canAddCatalogEntry(paidAccess, relative)).toBe(true);
  });
});

describe("buildAddWidgetCommand", () => {
  it("creates widget/add with the next id and z-index", () => {
    const existing = [deltaDefinition.createDefault("delta-main")];
    existing[0]!.layout.zIndex = 3;
    const command = buildAddWidgetCommand({
      session: "general",
      type: "delta",
      widgets: existing,
      definition: deltaDefinition,
    });
    expect(command).toEqual({
      type: "widget/add",
      session: "general",
      widget: expect.objectContaining({
        id: "delta-main-2",
        type: "delta",
        layout: expect.objectContaining({ zIndex: 4 }),
      }),
    });
  });
});

describe("createNextWidgetId", () => {
  it("increments suffixes until the id is unused", () => {
    const ids = new Set(["delta-main", "delta-main-2"]);
    expect(createNextWidgetId("delta", ids)).toBe("delta-main-3");
  });
});

describe("computeNextZIndex", () => {
  it("returns zero for an empty layout and max+1 otherwise", () => {
    expect(computeNextZIndex([])).toBe(0);
    expect(
      computeNextZIndex([
        deltaDefinition.createDefault("a"),
        { ...deltaDefinition.createDefault("b"), layout: { ...deltaDefinition.createDefault("b").layout, zIndex: 5 } },
      ]),
    ).toBe(6);
  });
});