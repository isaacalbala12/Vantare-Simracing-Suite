import type { CoreWidgetType, DesignSystemId } from "./profile-document";
import {
  DesignSystemResolutionError,
  type DesignSystemDefinition,
  type ResolvedWidgetSystem,
  type WidgetSystemRegistration,
} from "./design-system-definition";
import { vantareCrystalManifest } from "../design-systems/vantare-crystal/manifest";
import { vantareOriginalManifest } from "../design-systems/vantare-original/manifest";

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
    widgetType: CoreWidgetType;
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
  widgetType: CoreWidgetType,
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

  get(id: DesignSystemId, version: number): DesignSystemDefinition {
    const definition = this.definitions.get(systemKey(id, version));
    if (!definition) {
      throw new DesignSystemResolutionError(
        id,
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

  resolve(id: DesignSystemId, version: number, widgetType: CoreWidgetType): ResolvedWidgetSystem {
    const definition = this.get(id, version);
    const registration = definition.widgets.find((widget) => widget.widgetType === widgetType);
    if (!registration) {
      throw new DesignSystemResolutionError(
        id,
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