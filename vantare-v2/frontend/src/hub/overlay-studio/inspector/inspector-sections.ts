import { designSystemRegistry } from "../../../overlay/core/design-system-registry";
import type { ResolvedWidgetSystem } from "../../../overlay/core/design-system-definition";
import type { WidgetInstanceV3 } from "../../../overlay/core/profile-document";
import type { InspectorSectionId } from "../../../overlay/core/widget-definition";
import type { WidgetTypeDefinition } from "../../../overlay/core/widget-definition";
import { widgetTypeRegistry } from "../../../overlay/core/widget-registry";

export type ResolvedInspectorSection = {
  id: InspectorSectionId;
  labelKey: string;
  badge?: string;
};

export type ResolveInspectorSectionsDeps = {
  getWidgetDefinition(type: WidgetInstanceV3["type"]): WidgetTypeDefinition<Record<string, unknown>> | null;
  resolveWidgetSystem(widget: WidgetInstanceV3): ResolvedWidgetSystem | null;
};

const SECTION_LABEL_KEYS: Record<InspectorSectionId, string> = {
  design: "overlay.studio.inspector.sections.design",
  appearance: "overlay.studio.inspector.sections.appearance",
  content: "overlay.studio.inspector.sections.content",
  behavior: "overlay.studio.inspector.sections.behavior",
  layout: "overlay.studio.inspector.sections.layout",
  actions: "overlay.studio.inspector.sections.actions",
};

const UNSUPPORTED_VISUAL_SECTION: ResolvedInspectorSection = {
  id: "design",
  labelKey: "overlay.studio.inspector.sections.unsupported",
  badge: "!",
};

const SECTION_ORDER: readonly InspectorSectionId[] = [
  "design",
  "appearance",
  "content",
  "behavior",
  "layout",
  "actions",
];

function defaultDeps(): ResolveInspectorSectionsDeps {
  return {
    getWidgetDefinition(type) {
      try {
        return widgetTypeRegistry.get(type);
      } catch {
        return null;
      }
    },
    resolveWidgetSystem(widget) {
      try {
        return designSystemRegistry.resolve(
          widget.visual.systemId,
          widget.visual.systemVersion,
          widget.type,
        );
      } catch {
        return null;
      }
    },
  };
}

function section(id: InspectorSectionId): ResolvedInspectorSection {
  return { id, labelKey: SECTION_LABEL_KEYS[id] };
}

function hasAppearanceControls(system: ResolvedWidgetSystem): boolean {
  return (
    system.inspector.appearance.length > 0 || Boolean(system.inspector.CustomAppearanceInspector)
  );
}

function hasContentControls(definition: WidgetTypeDefinition<Record<string, unknown>>): boolean {
  return (
    definition.inspector.content.length > 0 || Boolean(definition.inspector.CustomContentInspector)
  );
}

function buildSupportedVisualSections(
  definition: WidgetTypeDefinition<Record<string, unknown>>,
  system: ResolvedWidgetSystem,
): ResolvedInspectorSection[] {
  const sections: ResolvedInspectorSection[] = [section("design")];
  if (hasAppearanceControls(system)) {
    sections.push(section("appearance"));
  }
  if (hasContentControls(definition)) {
    sections.push(section("content"));
  }
  sections.push(section("behavior"), section("layout"), section("actions"));
  return sections;
}

function buildUnsupportedVisualSections(
  definition: WidgetTypeDefinition<Record<string, unknown>>,
): ResolvedInspectorSection[] {
  const sections: ResolvedInspectorSection[] = [UNSUPPORTED_VISUAL_SECTION];
  if (hasContentControls(definition)) {
    sections.push(section("content"));
  }
  sections.push(section("behavior"), section("layout"), section("actions"));
  return sections;
}

function sortSections(sections: readonly ResolvedInspectorSection[]): ResolvedInspectorSection[] {
  const order = new Map(SECTION_ORDER.map((id, index) => [id, index]));
  return [...sections].sort((left, right) => (order.get(left.id) ?? 0) - (order.get(right.id) ?? 0));
}

export function resolveInspectorSections(
  widget: WidgetInstanceV3,
  deps: ResolveInspectorSectionsDeps = defaultDeps(),
): readonly ResolvedInspectorSection[] {
  const definition = deps.getWidgetDefinition(widget.type);
  if (!definition) {
    return [UNSUPPORTED_VISUAL_SECTION];
  }

  const system = deps.resolveWidgetSystem(widget);
  if (!system) {
    return sortSections(buildUnsupportedVisualSections(definition));
  }

  return sortSections(buildSupportedVisualSections(definition, system));
}