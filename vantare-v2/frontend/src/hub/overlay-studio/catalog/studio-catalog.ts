import type { AccessContext, FeatureGate, FeatureId } from "../../../lib/access-policy";
import { DesignSystemRegistry, designSystemRegistry } from "../../../overlay/core/design-system-registry";
import { ALL_WIDGET_TYPES, type DesignSystemId } from "../../../overlay/core/profile-document";
import type { WidgetType, SessionLayoutType, WidgetInstanceV3 } from "../../../overlay/core/profile-document";
import type { InspectorSectionId } from "../../../overlay/core/widget-definition";
import type { WidgetTypeDefinition } from "../../../overlay/core/widget-definition";
import { WidgetTypeRegistry, widgetTypeRegistry } from "../../../overlay/core/widget-registry";
import { getStudioMutationGate } from "../access/studio-access";
import type { StudioCommand } from "../state/studio-command";

export type CompatibleSystemRef = {
  systemId: DesignSystemId;
  systemVersion: number;
  label: string;
};

export type StudioCatalogEntry = {
  type: WidgetType;
  labelKey: string;
  defaultSize: { width: number; height: number };
  inspectorSections: readonly InspectorSectionId[];
  compatibleSystems: readonly CompatibleSystemRef[];
  requiredFeature: FeatureId;
};

export type StudioCatalogDeps = {
  listWidgetDefinitions(): readonly WidgetTypeDefinition<Record<string, unknown>>[];
  listCompatibleSystems(widgetType: WidgetType): readonly CompatibleSystemRef[];
};

function defaultDeps(): StudioCatalogDeps {
  return {
    listWidgetDefinitions() {
      return widgetTypeRegistry.list();
    },
    listCompatibleSystems(widgetType) {
      return resolveCompatibleSystems(widgetType, designSystemRegistry);
    },
  };
}

export function resolveCompatibleSystems(
  widgetType: WidgetType,
  registry: DesignSystemRegistry,
): CompatibleSystemRef[] {
  const systems: CompatibleSystemRef[] = [];
  for (const definition of registry.list()) {
    const supported = definition.widgets.some((registration) => registration.widgetType === widgetType);
    if (!supported) {
      continue;
    }
    systems.push({
      systemId: definition.id,
      systemVersion: definition.version,
      label: definition.label,
    });
  }
  return systems.sort((left, right) => left.label.localeCompare(right.label));
}

export function deriveStudioCatalog(deps: StudioCatalogDeps = defaultDeps()): StudioCatalogEntry[] {
  return deps
    .listWidgetDefinitions()
    .map((definition) => ({
      type: definition.type,
      labelKey: definition.labelKey,
      defaultSize: definition.capabilities.defaultSize,
      inspectorSections: definition.capabilities.inspectorSections,
      compatibleSystems: deps.listCompatibleSystems(definition.type),
      requiredFeature: definition.capabilities.requiredFeature,
    }))
    .sort((left, right) => ALL_WIDGET_TYPES.indexOf(left.type) - ALL_WIDGET_TYPES.indexOf(right.type));
}

export function getCatalogAddGate(access: AccessContext, entry: StudioCatalogEntry): FeatureGate {
  return getStudioMutationGate({
    access,
    mutation: "add",
    widget: { type: entry.type } as WidgetInstanceV3,
  });
}

export function canAddCatalogEntry(access: AccessContext, entry: StudioCatalogEntry): boolean {
  return getCatalogAddGate(access, entry).allowed;
}

export function createNextWidgetId(type: WidgetType, existingIds: ReadonlySet<string>): string {
  let candidate = `${type}-main`;
  let suffix = 2;
  while (existingIds.has(candidate)) {
    candidate = `${type}-main-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

export function computeNextZIndex(widgets: readonly WidgetInstanceV3[]): number {
  if (widgets.length === 0) {
    return 0;
  }
  return Math.max(...widgets.map((widget) => widget.layout.zIndex)) + 1;
}

export function buildAddWidgetCommand(input: {
  session: SessionLayoutType;
  type: WidgetType;
  widgets: readonly WidgetInstanceV3[];
  definition: WidgetTypeDefinition<Record<string, unknown>>;
}): StudioCommand {
  const existingIds = new Set(input.widgets.map((widget) => widget.id));
  const widgetId = createNextWidgetId(input.type, existingIds);
  const widget = input.definition.createDefault(widgetId);
  widget.layout.zIndex = computeNextZIndex(input.widgets);
  return {
    type: "widget/add",
    session: input.session,
    widget,
  };
}

export function createIsolatedCatalogDeps(
  widgetRegistry: WidgetTypeRegistry,
  designRegistry: DesignSystemRegistry,
): StudioCatalogDeps {
  return {
    listWidgetDefinitions() {
      return widgetRegistry.list();
    },
    listCompatibleSystems(widgetType) {
      return resolveCompatibleSystems(widgetType, designRegistry);
    },
  };
}
