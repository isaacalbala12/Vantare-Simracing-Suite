import type { DesignSystemDefinition, WidgetSystemRegistration } from "../core/design-system-definition";
import type { WidgetType } from "../core/profile-document";
import type { WidgetDesignV1 } from "../core/widget-design";

export type CatalogLot = {
  id: string;
  systemId: WidgetDesignV1["systemId"];
  designIds: readonly string[];
};

export type CatalogMatrixEntry = {
  id: string;
  widgetType: WidgetType;
  systemId: WidgetDesignV1["systemId"];
  systemVersion: number;
  configVersion: number;
  name: string;
  isDefault: boolean;
  visual: Readonly<Record<string, unknown>>;
  defaultSettings: Readonly<Record<string, unknown>>;
  defaultSize: Readonly<{ width: number; height: number }>;
  renderer: string;
  parser: string;
  configMigrationVersions: readonly number[];
  lotId: string;
};

export type CatalogMatrixInput = {
  officialDesigns: readonly WidgetDesignV1[];
  systems: readonly DesignSystemDefinition[];
  widgetTypes: readonly { type: WidgetType; capabilities: { defaultSize: { width: number; height: number } } }[];
  lots: readonly CatalogLot[];
};

function key(widgetType: WidgetType, systemId: WidgetDesignV1["systemId"], version: number): string {
  return `${widgetType}:${systemId}@${version}`;
}

function registrationFor(
  systems: readonly DesignSystemDefinition[],
  design: WidgetDesignV1,
): WidgetSystemRegistration | undefined {
  return systems
    .find((system) => system.id === design.systemId && system.version === design.systemVersion)
    ?.widgets.find((widget) => widget.widgetType === design.widgetType);
}

/**
 * Validates the complete, current catalog before a migration changes any source.
 * The caller owns the frozen snapshot; this checker deliberately has no second
 * registry and reads only the existing manifests/catalog definitions.
 */
export function buildAndCheckCatalogMatrix(input: CatalogMatrixInput): CatalogMatrixEntry[] {
  const lotsByDesignId = new Map<string, string>();
  const lotIds = new Set<string>();
  for (const lot of input.lots) {
    if (lotIds.has(lot.id)) throw new Error(`duplicate lot ID: ${lot.id}`);
    lotIds.add(lot.id);
    for (const designId of lot.designIds) {
      if (lotsByDesignId.has(designId)) throw new Error(`design appears in multiple lots: ${designId}`);
      lotsByDesignId.set(designId, lot.id);
    }
    if (lot.systemId === "vantare-original" && lot.designIds.length > 5) {
      throw new Error(`original lot exceeds five designs: ${lot.id}`);
    }
  }

  const widgets = new Map(input.widgetTypes.map((widget) => [widget.type, widget]));
  const designsById = new Map<string, WidgetDesignV1>();
  const defaults = new Map<string, number>();
  const entries = input.officialDesigns.map((design) => {
    if (designsById.has(design.id)) throw new Error(`duplicate design ID: ${design.id}`);
    designsById.set(design.id, design);
    const registration = registrationFor(input.systems, design);
    if (!registration) throw new Error(`invalid widget/system pair: ${design.id}`);
    const widget = widgets.get(design.widgetType);
    if (!widget) throw new Error(`orphan design widget type: ${design.id}`);
    const lotId = lotsByDesignId.get(design.id);
    if (!lotId) throw new Error(`design missing lot: ${design.id}`);
    const pair = key(design.widgetType, design.systemId, design.systemVersion);
    if (design.isDefault) defaults.set(pair, (defaults.get(pair) ?? 0) + 1);
    return {
      id: design.id,
      widgetType: design.widgetType,
      systemId: design.systemId,
      systemVersion: design.systemVersion,
      configVersion: design.configVersion,
      name: design.name,
      isDefault: Boolean(design.isDefault),
      visual: design.visual,
      defaultSettings: registration.defaultSettings,
      defaultSize: widget.capabilities.defaultSize,
      renderer: rendererProvenance(registration),
      parser: registration.parseSettings.name || "anonymous",
      configMigrationVersions: Object.keys(registration.configMigrations).map(Number).sort((a, b) => a - b),
      lotId,
    };
  });

  for (const system of input.systems) {
    for (const registration of system.widgets) {
      const pair = key(registration.widgetType, system.id, system.version);
      const count = defaults.get(pair) ?? 0;
      if (count === 0) throw new Error(`missing default design: ${pair}`);
      if (count > 1) throw new Error(`multiple default designs: ${pair}`);
    }
  }
  for (const designId of lotsByDesignId.keys()) {
    if (!designsById.has(designId)) throw new Error(`lot references missing design: ${designId}`);
  }
  return entries;
}

function rendererProvenance(registration: WidgetSystemRegistration): string {
  const renderer = Object.getOwnPropertyDescriptor(registration, "Renderer")?.value as
    | { displayName?: string; name?: string }
    | undefined;
  return renderer?.displayName || renderer?.name || "anonymous";
}

/** Compares a frozen matrix to a candidate migration without accepting drift. */
export function assertCatalogMatrixEquivalent(
  frozen: readonly CatalogMatrixEntry[],
  candidate: readonly CatalogMatrixEntry[],
): void {
  assertUniqueMatrixIds("frozen", frozen);
  assertUniqueMatrixIds("candidate", candidate);

  if (candidate.length < frozen.length) {
    const missing = frozen.find((entry) => !candidate.some((other) => other.id === entry.id));
    throw new Error(`catalog design disappeared: ${missing?.id ?? "unknown"}`);
  }
  if (candidate.length > frozen.length) {
    const added = candidate.find((entry) => !frozen.some((other) => other.id === entry.id));
    throw new Error(`catalog design appeared: ${added?.id ?? "unknown"}`);
  }

  for (let index = 0; index < frozen.length; index += 1) {
    const before = frozen[index];
    const after = candidate[index];
    if (before.id !== after.id) {
      if (!candidate.some((entry) => entry.id === before.id)) {
        throw new Error(`catalog design disappeared: ${before.id}`);
      }
      if (!frozen.some((entry) => entry.id === after.id)) {
        throw new Error(`catalog design appeared: ${after.id}`);
      }
      throw new Error(`catalog design order changed at index ${index}: ${before.id} -> ${after.id}`);
    }
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      throw new Error(`catalog metadata changed: ${before.id}`);
    }
  }
}

function assertUniqueMatrixIds(
  side: "frozen" | "candidate",
  matrix: readonly CatalogMatrixEntry[],
): void {
  const ids = new Set<string>();
  for (const entry of matrix) {
    if (ids.has(entry.id)) throw new Error(`duplicate ${side} catalog design ID: ${entry.id}`);
    ids.add(entry.id);
  }
}

// Original order is the current public catalog order. Crystal is canonical HTML
// section order (01–16); Engineer Radio is explicitly outside that historical HTML.
export const CATALOG_MIGRATION_LOTS: readonly CatalogLot[] = [
  { id: "original-01", systemId: "vantare-original", designIds: ["delta-original-base", "delta-time-attack", "standings-original-base", "relative-original-base", "pedals-original-base"] },
  { id: "original-02", systemId: "vantare-original", designIds: ["pedals-telemetry-original", "pedals-telemetry-compact-original", "racing-flags-original", "broadcast-tower-original", "head-to-head-original"] },
  { id: "original-03", systemId: "vantare-original", designIds: ["input-telemetry-original", "multiclass-relative-original", "delta-advanced-original", "fuel-strategy-original", "delta-trace-original"] },
  { id: "original-04", systemId: "vantare-original", designIds: ["race-schedule-original", "track-weather-original", "car-damage-visual-original", "car-damage-numbers-original"] },
  { id: "crystal-01", systemId: "vantare-crystal", designIds: ["relative-crystal-vertical", "standings-crystal-vertical"] },
  { id: "crystal-02", systemId: "vantare-crystal", designIds: ["broadcast-tower-crystal"] },
  { id: "crystal-03", systemId: "vantare-crystal", designIds: ["fuel-strategy-crystal-unified"] },
  { id: "crystal-04", systemId: "vantare-crystal", designIds: ["pedals-telemetry-crystal", "pedals-telemetry-compact-crystal", "pedals-crystal"] },
  { id: "crystal-05", systemId: "vantare-crystal", designIds: ["racing-flags-crystal"] },
  { id: "crystal-06", systemId: "vantare-crystal", designIds: ["delta-crystal-bar"] },
  { id: "crystal-07", systemId: "vantare-crystal", designIds: ["head-to-head-crystal"] },
  { id: "crystal-08", systemId: "vantare-crystal", designIds: ["multiclass-relative-crystal"] },
  { id: "crystal-09", systemId: "vantare-crystal", designIds: ["race-schedule-crystal"] },
  { id: "crystal-10", systemId: "vantare-crystal", designIds: ["input-crystal-blade", "input-crystal-capsule", "input-crystal-dense"] },
  { id: "crystal-11", systemId: "vantare-crystal", designIds: ["track-weather-crystal"] },
  { id: "crystal-12", systemId: "vantare-crystal", designIds: ["delta-trace-crystal"] },
  { id: "crystal-13", systemId: "vantare-crystal", designIds: ["car-damage-visual-crystal"] },
  { id: "crystal-14", systemId: "vantare-crystal", designIds: ["car-damage-numbers-crystal"] },
  { id: "crystal-15", systemId: "vantare-crystal", designIds: ["delta-crystal-simple"] },
  { id: "crystal-16", systemId: "vantare-crystal", designIds: ["delta-advanced-crystal"] },
  { id: "crystal-engineer", systemId: "vantare-crystal", designIds: ["engineer-radio-crystal"] },
];
