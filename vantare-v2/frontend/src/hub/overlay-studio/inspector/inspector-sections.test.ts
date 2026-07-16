import { describe, expect, it } from "vitest";
import type { WidgetInstanceV3 } from "../../../overlay/core/profile-document";
import type { ResolvedWidgetSystem } from "../../../overlay/core/design-system-definition";
import type { WidgetTypeDefinition } from "../../../overlay/core/widget-definition";
import { deltaDefinition } from "../../../overlay/widget-types/delta/delta-definition";
import { designSystemRegistry } from "../../../overlay/core/design-system-registry";
import {
  resolveInspectorSections,
  type ResolveInspectorSectionsDeps,
  type ResolvedInspectorSection,
} from "./inspector-sections";

function sectionIds(sections: readonly ResolvedInspectorSection[]): string[] {
  return sections.map((section) => section.id);
}

function createDeps(
  widgetDefinition: WidgetTypeDefinition<Record<string, unknown>> | null,
  system: ResolvedWidgetSystem | null,
): ResolveInspectorSectionsDeps {
  return {
    getWidgetDefinition: () => widgetDefinition,
    resolveWidgetSystem: () => system,
  };
}

describe("resolveInspectorSections", () => {
  it("returns Design, Appearance, Behavior, Layout and Actions for Delta without Content", () => {
    const widget = deltaDefinition.createDefault("delta-main");
    const system = designSystemRegistry.resolve(
      widget.visual.systemId,
      widget.visual.systemVersion,
      widget.type,
    );
    const sections = resolveInspectorSections(
      widget,
      createDeps(deltaDefinition, system),
    );

    expect(sectionIds(sections)).toEqual([
      "design",
      "appearance",
      "behavior",
      "layout",
      "actions",
    ]);
    expect(sections.find((section) => section.id === "content")).toBeUndefined();
  });

  it("includes Content when the widget definition exposes content controls", () => {
    const widget = deltaDefinition.createDefault("delta-main");
    const syntheticDefinition: WidgetTypeDefinition<Record<string, unknown>> = {
      ...deltaDefinition,
      inspector: {
        content: [
          {
            kind: "toggle",
            id: "show-title",
            labelKey: "overlay.inspector.test.showTitle",
            path: "showTitle",
            defaultValue: true,
          },
        ],
      },
    };
    const system = designSystemRegistry.resolve(
      widget.visual.systemId,
      widget.visual.systemVersion,
      widget.type,
    );

    const sections = resolveInspectorSections(
      widget,
      createDeps(syntheticDefinition, system),
    );

    expect(sectionIds(sections)).toEqual([
      "design",
      "appearance",
      "content",
      "behavior",
      "layout",
      "actions",
    ]);
  });

  it("replaces Design and Appearance with one unsupported diagnostic when the visual pair is incompatible", () => {
    const widget: WidgetInstanceV3 = {
      ...deltaDefinition.createDefault("standings-main"),
      id: "standings-main",
      type: "standings",
    };
    const standingsDefinition: WidgetTypeDefinition<Record<string, unknown>> = {
      ...deltaDefinition,
      type: "standings",
      inspector: { content: [] },
    };

    const sections = resolveInspectorSections(
      widget,
      createDeps(standingsDefinition, null),
    );

    expect(sectionIds(sections)).toEqual(["design", "behavior", "layout", "actions"]);
    expect(sections[0]).toMatchObject({
      id: "design",
      labelKey: "overlay.studio.inspector.sections.unsupported",
      badge: "!",
    });
    expect(sections.find((section) => section.id === "appearance")).toBeUndefined();
  });

  it("returns only the unsupported diagnostic for unknown widget types", () => {
    const widget: WidgetInstanceV3 = {
      ...deltaDefinition.createDefault("legacy-widget"),
      type: "standings",
    };

    const sections = resolveInspectorSections(widget, createDeps(null, null));

    expect(sections).toEqual([
      {
        id: "design",
        labelKey: "overlay.studio.inspector.sections.unsupported",
        badge: "!",
      },
    ]);
  });

  it("omits Appearance when the resolved system exposes no appearance controls", () => {
    const widget = deltaDefinition.createDefault("delta-main");
    const system = designSystemRegistry.resolve(
      widget.visual.systemId,
      widget.visual.systemVersion,
      widget.type,
    );
    const systemWithoutAppearance: ResolvedWidgetSystem = {
      ...system,
      inspector: { appearance: [] },
    };

    const sections = resolveInspectorSections(
      widget,
      createDeps(deltaDefinition, systemWithoutAppearance),
    );

    expect(sectionIds(sections)).toEqual(["design", "behavior", "layout", "actions"]);
  });
});