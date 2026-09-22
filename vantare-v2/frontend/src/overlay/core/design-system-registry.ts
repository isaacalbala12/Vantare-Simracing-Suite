import type { WidgetType, DesignSystemId } from "./profile-document";
import {
  DesignSystemResolutionError,
  type DesignSystemDefinition,
  type ResolvedWidgetSystem,
  type WidgetSystemRegistration,
} from "./design-system-definition";
import { vantareCrystalManifest } from "../design-systems/vantare-crystal/manifest";
import { vantareEnduranceManifest } from "../design-systems/vantare-endurance/manifest";
import { vantareOriginalManifest } from "../design-systems/vantare-original/manifest";
import { vantareEfficiencyManifest } from "../design-systems/vantare-efficiency/manifest";
import { vantareIracingManifest } from "../design-systems/vantare-iracing/manifest";
import {
  normalizeDesignSystemId,
  type DesignSystemIdAlias,
} from "./design-system-names";

type MigrationStep = (settings: Record<string, unknown>) => Record<string, unknown>;

function systemKey(id: DesignSystemId, version: number): string {
  return `${id}@${version}`;
}

export function migrateSettingsSequential(
  fromVersion: number,
  toVersion: number,
  migrations: Readonly<Record<number, MigrationStep>>,
  settings: Record<string, unknown>,
  errorContext: {
    systemId: DesignSystemId;
    widgetType: WidgetType;
    kind: "system" | "config";
  },
): Record<string, unknown> {
  if (fromVersion >= toVersion) {
    return { ...settings };
  }

  let nextSettings = { ...settings };
  for (let version = fromVersion; version < toVersion; version += 1) {
    const migrate = migrations[version];
    if (!migrate) {
      throw new DesignSystemResolutionError(
        errorContext.systemId,
        version,
        errorContext.widgetType,
        `missing ${errorContext.kind} migration from version ${version} to ${version + 1}`,
      );
    }
    nextSettings = migrate(nextSettings);
  }
  return nextSettings;
}

export function migrateSystemSettings(
  definition: DesignSystemDefinition,
  widgetType: WidgetType,
  fromVersion: number,
  toVersion: number,
  settings: Record<string, unknown>,
): Record<string, unknown> {
  let nextSettings = { ...settings };
  for (let version = fromVersion; version < toVersion; version += 1) {
    const migrate = definition.systemMigrations[version];
    if (!migrate) {
      throw new DesignSystemResolutionError(
        definition.id,
        version,
        widgetType,
        `missing system migration from version ${version} to ${version + 1}`,
      );
    }
    nextSettings = migrate(widgetType, nextSettings);
  }
  return nextSettings;
}

export function migrateConfigSettings(
  registration: WidgetSystemRegistration,
  fromVersion: number,
  toVersion: number,
  settings: Record<string, unknown>,
  systemId: DesignSystemId = "vantare-original",
): Record<string, unknown> {
  return migrateSettingsSequential(fromVersion, toVersion, registration.configMigrations, settings, {
    systemId,
    widgetType: registration.widgetType,
    kind: "config",
  });
}

export class DesignSystemRegistry {
  private readonly definitions = new Map<string, DesignSystemDefinition>();

  register(definition: DesignSystemDefinition): void {
    const key = systemKey(definition.id, definition.version);
    if (this.definitions.has(key)) {
      throw new Error(`design system already registered: ${key}`);
    }
    this.definitions.set(key, definition);
  }

  get(id: DesignSystemIdAlias, version: number): DesignSystemDefinition {
    const normalizedId = normalizeDesignSystemId(id);
    const definition = normalizedId === undefined
      ? undefined
      : this.definitions.get(systemKey(normalizedId, version));
    if (!definition) {
      throw new DesignSystemResolutionError(
        (normalizedId ?? id) as DesignSystemId,
        version,
        "delta",
        `unknown design system version: ${id}@${version}`,
      );
    }
    return definition;
  }

  list(): readonly DesignSystemDefinition[] {
    return [...this.definitions.values()];
  }

  resolve(id: DesignSystemIdAlias, version: number, widgetType: WidgetType): ResolvedWidgetSystem {
    const definition = this.get(id, version);
    const registration = definition.widgets.find((widget) => widget.widgetType === widgetType);
    if (!registration) {
      throw new DesignSystemResolutionError(
        definition.id,
        version,
        widgetType,
        `unsupported widget type for design system: ${id}@${version}/${widgetType}`,
      );
    }
    return {
      ...registration,
      systemId: definition.id,
      systemVersion: definition.version,
    };
  }
}

export const designSystemRegistry = new DesignSystemRegistry();
designSystemRegistry.register(vantareOriginalManifest);
designSystemRegistry.register(vantareCrystalManifest);
designSystemRegistry.register(vantareEnduranceManifest);
designSystemRegistry.register(vantareEfficiencyManifest);
designSystemRegistry.register(vantareIracingManifest);
