import { DesignSystemResolutionError, type ResolvedWidgetSystem } from "./design-system-definition";
import {
  designSystemRegistry,
  migrateConfigSettings,
  migrateSystemSettings,
} from "./design-system-registry";
import type { WidgetInstanceV3 } from "./profile-document";

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function mergeVisualSettings(
  baseSettings: Readonly<Record<string, unknown>>,
  appearanceOverrides: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  return mergeRecords(structuredClone(baseSettings), structuredClone(appearanceOverrides));
}

function mergeRecords(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): Record<string, unknown> {
  for (const [key, value] of Object.entries(source)) {
    const existing = target[key];
    if (isPlainObject(existing) && isPlainObject(value)) {
      target[key] = mergeRecords({ ...existing }, value);
      continue;
    }
    target[key] = Array.isArray(value) ? [...value] : value;
  }
  return target;
}

export function migrateWidgetBaseSettings(widget: WidgetInstanceV3): Record<string, unknown> {
  const targetDefinition = designSystemRegistry.resolve(widget.visual.systemId, 1, widget.type);
  const definition = designSystemRegistry.get(widget.visual.systemId, targetDefinition.systemVersion);
  const registration = definition.widgets.find((entry) => entry.widgetType === widget.type);
  if (!registration) {
    throw new DesignSystemResolutionError(
      widget.visual.systemId,
      targetDefinition.systemVersion,
      widget.type,
      `unsupported widget type for design system: ${widget.visual.systemId}@${targetDefinition.systemVersion}/${widget.type}`,
    );
  }

  const migratedBaseSettings = migrateSystemSettings(
    definition,
    widget.type,
    widget.visual.systemVersion,
    targetDefinition.systemVersion,
    widget.visual.baseSettings,
  );

  return migrateConfigSettings(
    registration,
    widget.visual.configVersion,
    registration.configVersion,
    migratedBaseSettings,
    widget.visual.systemId,
  );
}

export function prepareWidgetVisualSettings(widget: WidgetInstanceV3): {
  registration: ResolvedWidgetSystem;
  settings: Record<string, unknown>;
} {
  const registration = designSystemRegistry.resolve(widget.visual.systemId, 1, widget.type);
  const migratedBaseSettings = migrateWidgetBaseSettings(widget);
  const mergedSettings = mergeVisualSettings(migratedBaseSettings, widget.visual.appearanceOverrides);
  return {
    registration,
    settings: registration.parseSettings(mergedSettings),
  };
}