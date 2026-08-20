import type { WidgetInstanceV3, WidgetType } from "../overlay/core/profile-document";
import type { TelemetrySnapshot } from "../overlay/core/telemetry-snapshot";
import { widgetTypeRegistry } from "../overlay/core/widget-registry";
import type {
  OverlayMappedField,
  OverlayProjectionAdaptation,
  OverlayProjectionMapping,
} from "../overlay/projection/overlay-projection-adapter";
import {
  OVERLAY_SHADOW_POLICIES,
  compareOverlayShadow,
  createOverlayV2PlayerInstrumentsComparator,
  type OverlayShadowCoverage,
  type OverlayShadowReport,
} from "../overlay/telemetry-shadow/overlay-shadow-comparator";
import type { OverlayFrameV2, OverlaySourceStatusV2 } from "../generated/telemetry";

export const SHADOW_HARNESS_SCENARIOS = [
  "equal",
  "partial",
  "stale",
  "disconnected",
  "unsupported",
] as const;

export type ShadowHarnessScenario = typeof SHADOW_HARNESS_SCENARIOS[number];

export type ShadowHarnessScenarioDefinition = Readonly<{
  label: string;
  stateLabel: string;
  description: string;
  widgets: readonly WidgetType[];
  projection: OverlayProjectionAdaptation;
}>;

export type ShadowHarnessCoverage = Readonly<{
  contractVersion: 1;
  registeredDefinitions: number;
  policyDefinitions: number;
  coveredDefinitions: number;
  complete: boolean;
  widgets: readonly Readonly<{
    widgetType: WidgetType;
    coverage: OverlayShadowCoverage;
    ruleCount: number;
  }>[];
}>;

const LEGACY_SNAPSHOT = createSnapshot("ready");
const MAPPED_PROJECTION = createMapping(createSnapshot("ready"));

const SCENARIOS: Readonly<Record<ShadowHarnessScenario, ShadowHarnessScenarioDefinition>> = {
  equal: {
    label: "Igualdad exacta",
    stateLabel: "Paridad exacta",
    description: "Pedals conserva tres ceros legítimos en ambos pipelines.",
    widgets: ["pedals"],
    projection: MAPPED_PROJECTION,
  },
  partial: {
    label: "Cobertura parcial",
    stateLabel: "Parcial",
    description: "Standings compara señales demostradas y enumera las ausentes.",
    widgets: ["pedals", "standings"],
    projection: MAPPED_PROJECTION,
  },
  stale: {
    label: "Dato stale",
    stateLabel: "Stale",
    description: "El valor permanece visible, pero su calidad impide declararlo igual.",
    widgets: ["pedals"],
    projection: createMapping(createSnapshot("stale"), [
      mappedField("vehicles[0].throttle", "player.throttle", "stale"),
    ]),
  },
  disconnected: {
    label: "Fuente desconectada",
    stateLabel: "Desconectado",
    description: "Sin un frame utilizable, el comparator queda bloqueado de forma explícita.",
    widgets: ["pedals"],
    projection: {
      kind: "blocked",
      code: "player-unavailable",
      quality: [],
      unsupported: [],
    },
  },
  unsupported: {
    label: "Cobertura no disponible",
    stateLabel: "Unsupported",
    description: "Delta y Relative no se aprueban mientras falten sus señales canónicas.",
    widgets: ["delta", "relative"],
    projection: MAPPED_PROJECTION,
  },
};

export function getShadowHarnessScenario(
  scenario: ShadowHarnessScenario,
): ShadowHarnessScenarioDefinition {
  return SCENARIOS[scenario];
}

export function buildShadowHarnessReport(
  scenario: ShadowHarnessScenario,
): OverlayShadowReport {
  const definition = getShadowHarnessScenario(scenario);
  return compareOverlayShadow({
    legacySnapshot: LEGACY_SNAPSHOT,
    projection: definition.projection,
    widgets: definition.widgets.map(createWidget),
  });
}

export function buildShadowHarnessCoverage(): ShadowHarnessCoverage {
  const definitions = widgetTypeRegistry.list();
  const widgets = definitions
    .map(({ type }) => {
      const policy = OVERLAY_SHADOW_POLICIES[type];
      return {
        widgetType: type,
        coverage: policy.coverage,
        ruleCount: policy.rules.length,
      };
    })
    .sort((left, right) => left.widgetType.localeCompare(right.widgetType));
  const policyDefinitions = Object.keys(OVERLAY_SHADOW_POLICIES).length;
  return {
    contractVersion: 1,
    registeredDefinitions: definitions.length,
    policyDefinitions,
    coveredDefinitions: widgets.length,
    complete:
      definitions.length === policyDefinitions &&
      widgets.length === definitions.length,
    widgets,
  };
}

export function buildPlayerInstrumentsV2HarnessFixture() {
  const widget = createWidget("pedals-telemetry");
  widget.content = { showPosition: false, showClutch: true };
  const snapshot = createSnapshot("ready");
  const frame = playerInstrumentsFrameV2();
  const source: OverlaySourceStatusV2 = { state: "live" };
  const comparator = createOverlayV2PlayerInstrumentsComparator();
  const comparison = comparator.compare({
    legacySnapshot: snapshot,
    frame,
    source,
    content: { showPosition: false, showClutch: true },
  });
  return { widget, snapshot, frame, source, comparison, summary: comparator.sessionSummary() };
}

function createWidget(type: WidgetType): WidgetInstanceV3 {
  return widgetTypeRegistry.get(type).createDefault(`shadow-fixture-${type}`);
}

function createSnapshot(status: TelemetrySnapshot["status"]): TelemetrySnapshot {
  return {
    status,
    capturedAt: 1_785_430_800_000,
    session: {
      type: "race",
      trackName: "PRIVATE_TRACK_SHADOW_105",
    },
    player: {
      inPit: false,
      throttle: 0,
      brake: 0,
      clutch: 0,
      speedKph: 0,
      rpm: 0,
      gear: 0,
      totalLaps: 0,
      lapNumber: 0,
    },
    scoring: [
      {
        id: "PRIVATE_VEHICLE_ID_SHADOW_105",
        place: 1,
        totalLaps: 0,
        inPits: false,
        isPlayer: true,
        driverName: "PRIVATE_DRIVER_SHADOW_105",
        teamName: "PRIVATE_TEAM_SHADOW_105",
      },
    ],
  };
}

function playerInstrumentsFrameV2(): OverlayFrameV2 {
  const missing = { q: "missing" as const };
  return {
    contract: 2, algorithm: 1, epoch: 1, sequence: 1,
    sessionId: "shadow-fixture", generatedAt: "2026-08-19T12:00:00Z",
    units: { speed: "kph", temperature: "celsius", pressure: "kpa", fuel: "liters" },
    session: { track: missing, phase: missing, flag: missing, remaining: missing, maxLaps: missing },
    controls: { history: missing },
    player: {
      speed: { q: "fresh" }, rpm: { q: "fresh" }, gear: { q: "fresh" },
      throttle: { q: "fresh" }, brake: { q: "fresh" }, clutch: { q: "fresh" }, steering: missing,
    },
    standings: [], relative: [], delta: { seconds: missing, available: [] },
    fuel: { remaining: missing, capacity: missing, perLap: missing, estimatedLaps: missing },
    spotter: { mode: "none", left: missing, right: missing },
    capabilities: {
      supported: ["controls"], available: { controls: "fresh" },
      modes: { spatial: [], delta: [], standings: "none", gaps: "none" },
    },
  };
}

function createMapping(
  snapshot: TelemetrySnapshot,
  overrides: readonly OverlayMappedField[] = [],
): OverlayProjectionMapping {
  const fields = [
    mappedField("sessionType", "session.type"),
    mappedField("playerVehicleId", "player"),
    mappedField("vehicles[0].inPit", "player.inPit"),
    mappedField("vehicles[0].throttle", "player.throttle"),
    mappedField("vehicles[0].brake", "player.brake"),
    mappedField("vehicles[0].clutch", "player.clutch"),
    mappedField("vehicles[0].speedMps", "player.speedKph"),
    mappedField("vehicles[0].engineRpm", "player.rpm"),
    mappedField("vehicles[0].gear", "player.gear"),
    mappedField("vehicles[0].completedLaps", "player.totalLaps"),
    mappedField("vehicles[0].completedLaps", "player.lapNumber"),
    mappedField("vehicles[0].id", "scoring[].id"),
    mappedField("vehicles[0].position", "scoring[0].place"),
    mappedField("vehicles[0].completedLaps", "scoring[0].totalLaps"),
    mappedField("vehicles[0].inPit", "scoring[0].inPits"),
  ];
  const bySourceAndTarget = new Map(
    fields.map((field) => [`${field.sourcePath}|${field.targetPath ?? ""}`, field]),
  );
  for (const field of overrides) {
    bySourceAndTarget.set(`${field.sourcePath}|${field.targetPath ?? ""}`, field);
  }
  return {
    kind: "mapped",
    snapshot,
    quality: [...bySourceAndTarget.values()],
    unsupported: [
      { targetPath: "player.deltaSeconds", reason: "unsupported-by-projection" },
      { targetPath: "scoring[].timeGapToPlayer", reason: "unsupported-by-projection" },
    ],
  };
}

function mappedField(
  sourcePath: string,
  targetPath: string,
  freshness: OverlayMappedField["freshness"] = "fresh",
): OverlayMappedField {
  return {
    sourcePath,
    targetPath,
    present: freshness !== "missing",
    provenance: freshness === "missing" ? "unknown" : "observed",
    freshness,
    usable: freshness === "fresh" || freshness === "stale",
  };
}
