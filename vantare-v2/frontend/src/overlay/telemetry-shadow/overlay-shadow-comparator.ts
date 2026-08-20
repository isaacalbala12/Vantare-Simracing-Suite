import type { WidgetInstanceV3, WidgetType } from "../core/profile-document";
import type { TelemetrySnapshot } from "../core/telemetry-snapshot";
import type { WidgetViewModelBase } from "../core/widget-definition";
import { widgetTypeRegistry } from "../core/widget-registry";
import type { StandingsRowViewModel, StandingsViewModel } from "../widget-types/standings/standings-view-model";
import type { BroadcastTowerRow, BroadcastTowerViewModel } from "../widget-types/broadcast-tower/broadcast-tower-view-model";
import type { InputTelemetrySample } from "../widget-types/input-telemetry/input-telemetry-accumulator";
import type { InputTelemetryContent } from "../widget-types/input-telemetry/input-telemetry-definition";
import { buildInputTelemetryViewModel } from "../widget-types/input-telemetry/input-telemetry-view-model";
import type { OverlayFrameV2, OverlaySourceStatusV2 } from "../../generated/telemetry";
import type { PedalsTelemetryContent } from "../widget-types/pedals-telemetry/pedals-telemetry-definition";
import {
  buildPedalsTelemetryViewModel,
  type PedalsTelemetryViewModel,
} from "../widget-types/pedals-telemetry/pedals-telemetry-view-model";
import {
  buildPedalsTelemetryViewModelV2,
  pedalsTelemetryDisplayedValues,
} from "../widget-types/pedals-telemetry/pedals-telemetry-view-model-v2";
import type { DeltaViewModel } from "../widget-types/delta/delta-view-model";
import type { DeltaAdvancedViewModel } from "../widget-types/delta-advanced/delta-advanced-view-model";
import type { DeltaTraceViewModel } from "../widget-types/delta-trace/delta-trace-view-model";
import type { TrackMapViewModel } from "../widget-types/track-map/track-map-view-model";
import type { FuelStrategyViewModel } from "../widget-types/fuel-strategy/fuel-strategy-view-model";
import type { MulticlassRelativeRow, MulticlassRelativeViewModel } from "../widget-types/multiclass-relative/multiclass-relative-view-model";
import type { RelativeRowViewModel, RelativeViewModel } from "../widget-types/relative/relative-view-model";
import { readScoringBoolean, readScoringNumber, readScoringString } from "../widget-types/shared/scoring-readers";
import type {
  OverlayProjectionAdaptation,
  OverlayProjectionMapping,
} from "../projection/overlay-projection-adapter";
import {
  limitShadowEntries,
  sanitizeShadowObservation,
  sanitizeShadowPath,
  type SanitizedShadowObservation,
  type ShadowDisclosure,
} from "./overlay-shadow-sanitizer";

const CONTRACT_VERSION = 1 as const;
const MAX_LIST_ITEMS = 104;
const MAX_WIDGETS = 128;
const INPUT_HISTORY_LIMIT = 120;
const MAX_NON_MISMATCH_SAMPLES = 64;
const RUNTIME_STATUSES = ["ready", "missing", "stale", "disconnected", "error"] as const;

export type OverlayShadowCoverage = "exact" | "partial" | "not-comparable" | "external";

export type OverlayShadowClassification =
  | "equal"
  | "within-tolerance"
  | "value-mismatch"
  | "missing-legacy"
  | "missing-projection"
  | "stale-projection"
  | "invalid-projection"
  | "unsupported-by-projection"
  | "shape-mismatch"
  | "builder-error"
  | "external-consumer";

export type OverlayShadowRuleCode =
  | "exact"
  | "absolute-tolerance"
  | "presence"
  | "list-shape"
  | "unit-contract"
  | "unsupported"
  | "external"
  | "builder"
  | "blocked";

export type OverlayShadowEntry = Readonly<{
  path: string;
  classification: OverlayShadowClassification;
  rule: OverlayShadowRuleCode;
  sourcePaths: readonly string[];
  tolerance?: number;
  item?: number;
  observation?: SanitizedShadowObservation;
}>;

export type OverlayShadowCounts = Readonly<{
  fields: number;
  equal: number;
  withinTolerance: number;
  mismatches: number;
  external: number;
}>;

export type OverlayShadowWidgetResult = Readonly<{
  widgetType: WidgetType;
  instance: number;
  coverage: OverlayShadowCoverage;
  outcome: "equal" | "mismatch" | "not-comparable" | "external" | "blocked" | "builder-error";
  summary: OverlayShadowCounts;
  entries: readonly OverlayShadowEntry[];
}>;

export type OverlayShadowReport = Readonly<{
  contractVersion: typeof CONTRACT_VERSION;
  summary: OverlayShadowCounts & Readonly<{ widgets: number }>;
  widgets: readonly OverlayShadowWidgetResult[];
  truncated: boolean;
}>;

export const OVERLAY_V2_PLAYER_INSTRUMENT_TOLERANCES = Object.freeze({
  throttle: 1e-9,
  brake: 1e-9,
  clutch: 1e-9,
  speedKph: 3.6e-6,
  rpm: 1e-6,
  gear: 0,
});

export type OverlayV2PlayerInstrumentComparison = Readonly<{
  equal: boolean;
  phase: OverlayShadowPhase;
  mismatches: readonly string[];
  legacyDisplayed: Readonly<Record<string, string>>;
  overlayV2Displayed: Readonly<Record<string, string>>;
}>;

/**
 * Effective phase of one shadow comparison. Overlay v1 legacy retains the last
 * known value while the v2 view models hide stale values on purpose, so only
 * `live` comparisons are divergences; every other phase is a declared contract
 * difference and is accounted separately.
 */
export type OverlayShadowPhase = "live" | "stale" | "degraded" | "no-frame" | "transition";

export const OVERLAY_SHADOW_PHASES: readonly OverlayShadowPhase[] = Object.freeze([
  "live",
  "stale",
  "degraded",
  "no-frame",
  "transition",
]);

export type OverlayShadowPhaseCounts = Readonly<Record<OverlayShadowPhase, number>>;

export type OverlayV2ShadowSessionSummary = Readonly<{
  /** Frames compared in the `live` phase: the gate denominator. */
  frames: number;
  /** Mismatches observed in the `live` phase: the gate numerator. */
  mismatches: number;
  /** Mismatches observed outside `live`; an intentional contract difference. */
  declaredDifferences: number;
  framesByPhase: OverlayShadowPhaseCounts;
  mismatchesByPhase: OverlayShadowPhaseCounts;
  /** Times the accumulators were rotated because the stream epoch changed. */
  epochResets: number;
  metrics: Readonly<Record<string, number>>;
}>;

export type OverlayV2PlayerInstrumentsComparator = Readonly<{
  compare(input: Readonly<{
    legacySnapshot: TelemetrySnapshot;
    frame: OverlayFrameV2;
    source: OverlaySourceStatusV2;
    content: PedalsTelemetryContent;
  }>): OverlayV2PlayerInstrumentComparison;
  /** Rotates every accumulator. The runtime calls it on epoch/session change. */
  reset(): void;
  sessionSummary(): OverlayV2ShadowSessionSummary;
}>;

/**
 * Resolves the effective phase from the legacy status and the v2 source state.
 *
 * Under load (54 AI cars measured) the LMU session block grazes the 500 ms
 * freshness limit and the driver oscillates stale<->live every few seconds.
 * The two contracts observe that edge at slightly different instants, so a
 * comparison where they disagree is a `transition`, never a live divergence:
 * a comparison is `live` only when both sides independently say so.
 */
export function resolveOverlayShadowPhase(
  legacySnapshot: TelemetrySnapshot,
  source: OverlaySourceStatusV2,
): OverlayShadowPhase {
  const legacy = legacyPhase(legacySnapshot);
  const overlayV2 = overlayV2Phase(source);
  return legacy === overlayV2 ? legacy : "transition";
}

function legacyPhase(snapshot: TelemetrySnapshot): Exclude<OverlayShadowPhase, "transition"> {
  switch (snapshot.status) {
    case "ready":
      return "live";
    case "stale":
      return "stale";
    default:
      return "no-frame";
  }
}

function overlayV2Phase(source: OverlaySourceStatusV2): Exclude<OverlayShadowPhase, "transition"> {
  switch (source.state) {
    case "live":
      return "live";
    case "stale":
      return "stale";
    case "stopped":
    case "error":
      return "no-frame";
    default:
      return "degraded";
  }
}

type ShadowPhaseAccumulator = Readonly<{
  record(feature: string, phase: OverlayShadowPhase, fields: readonly string[]): void;
  reset(): void;
  markEpochReset(): void;
  summary(): OverlayV2ShadowSessionSummary;
}>;

function emptyPhaseCounts(): Record<OverlayShadowPhase, number> {
  return { live: 0, stale: 0, degraded: 0, "no-frame": 0, transition: 0 };
}

function createShadowPhaseAccumulator(): ShadowPhaseAccumulator {
  let framesByPhase = emptyPhaseCounts();
  let mismatchesByPhase = emptyPhaseCounts();
  let epochResets = 0;
  let byMetric = new Map<string, number>();
  return {
    record(feature, phase, fields) {
      framesByPhase[phase] += 1;
      mismatchesByPhase[phase] += fields.length;
      for (const field of fields) {
        const key = `overlay_shadow_mismatches_total{feature="${feature}",field="${field}",phase="${phase}"}`;
        byMetric.set(key, (byMetric.get(key) ?? 0) + 1);
      }
    },
    reset() {
      framesByPhase = emptyPhaseCounts();
      mismatchesByPhase = emptyPhaseCounts();
      byMetric = new Map();
    },
    markEpochReset() {
      epochResets += 1;
    },
    summary() {
      const declaredDifferences = OVERLAY_SHADOW_PHASES.filter((phase) => phase !== "live")
        .reduce((total, phase) => total + mismatchesByPhase[phase], 0);
      return Object.freeze({
        frames: framesByPhase.live,
        mismatches: mismatchesByPhase.live,
        declaredDifferences,
        framesByPhase: Object.freeze({ ...framesByPhase }),
        mismatchesByPhase: Object.freeze({ ...mismatchesByPhase }),
        epochResets,
        metrics: Object.freeze(Object.fromEntries(
          [...byMetric.entries()].sort(([left], [right]) => left.localeCompare(right)),
        )),
      });
    },
  };
}

export function createOverlayV2PlayerInstrumentsComparator(): OverlayV2PlayerInstrumentsComparator {
  const accumulator = createShadowPhaseAccumulator();
  return {
    compare(input) {
      const legacy = buildPedalsTelemetryViewModel(input.legacySnapshot, input.content);
      const overlayV2 = buildPedalsTelemetryViewModelV2(input.frame, input.source, input.content);
      const fields = comparePlayerInstrumentModels(legacy, overlayV2);
      const phase = resolveOverlayShadowPhase(input.legacySnapshot, input.source);
      accumulator.record("player-instruments", phase, fields);
      return Object.freeze({
        equal: fields.length === 0,
        phase,
        mismatches: Object.freeze(fields),
        legacyDisplayed: pedalsTelemetryDisplayedValues(legacy),
        overlayV2Displayed: pedalsTelemetryDisplayedValues(overlayV2),
      });
    },
    reset() {
      accumulator.reset();
      accumulator.markEpochReset();
    },
    sessionSummary: accumulator.summary,
  };
}

function comparePlayerInstrumentModels(
  legacy: PedalsTelemetryViewModel,
  overlayV2: PedalsTelemetryViewModel,
): string[] {
  const mismatch = new Set<string>();
  for (const field of Object.keys(OVERLAY_V2_PLAYER_INSTRUMENT_TOLERANCES) as (keyof typeof OVERLAY_V2_PLAYER_INSTRUMENT_TOLERANCES)[]) {
    if (!numbersWithin(legacy[field], overlayV2[field], OVERLAY_V2_PLAYER_INSTRUMENT_TOLERANCES[field])) mismatch.add(field);
  }
  const legacyDisplayed = pedalsTelemetryDisplayedValues(legacy);
  const overlayV2Displayed = pedalsTelemetryDisplayedValues(overlayV2);
  for (const field of Object.keys(legacyDisplayed)) {
    if (legacyDisplayed[field] !== overlayV2Displayed[field]) mismatch.add(`display.${field}`);
  }
  return [...mismatch].sort();
}

function numbersWithin(left: number | undefined, right: number | undefined, tolerance: number): boolean {
  if (left === undefined || right === undefined) return left === right;
  return Math.abs(left - right) <= tolerance;
}

type ShadowScalar = string | number | boolean | null | undefined;
type ViewModelReader = (model: WidgetViewModelBase) => ShadowScalar;
type RowReader = (row: unknown) => ShadowScalar;

type QualitySelector =
  | Readonly<{ kind: "target"; path: string }>
  | Readonly<{ kind: "source"; path: string }>
  | Readonly<{ kind: "vehicle"; field: string }>
  | Readonly<{ kind: "player-vehicle"; field: string }>;

type QualityRequirement =
  | Readonly<{
      mode: "allOf" | "anyOf";
      selectors: readonly QualitySelector[];
    }>
  | Readonly<{
      mode: "firstAvailable";
      selectors: readonly QualitySelector[];
      select: (snapshot: TelemetrySnapshot) => number;
    }>;

type ScalarRule = Readonly<{
  kind: "scalar";
  path: string;
  read: ViewModelReader;
  quality: QualityRequirement;
  tolerance?: number;
  disclosure: ShadowDisclosure;
}>;

type ListFieldRule = Readonly<{
  path: string;
  read: RowReader;
  quality: QualityRequirement;
  tolerance?: number;
  disclosure: ShadowDisclosure;
}>;

type ListRule = Readonly<{
  kind: "list";
  path: string;
  read: (model: WidgetViewModelBase) => readonly unknown[];
  identities: (
    rows: readonly unknown[],
    snapshot: TelemetrySnapshot,
  ) => readonly string[] | undefined;
  orderSignificant: boolean;
  fields: readonly ListFieldRule[];
}>;

type UnsupportedRule = Readonly<{
  kind: "unsupported";
  path: string;
  sourcePaths: readonly QualitySelector[];
}>;

type DeclaredMismatchRule = Readonly<{
  kind: "declared-mismatch";
  path: string;
  quality: QualityRequirement;
}>;

type ExternalRule = Readonly<{
  kind: "external";
  path: string;
}>;

type ShadowPolicyRule = ScalarRule | ListRule | UnsupportedRule | DeclaredMismatchRule | ExternalRule;

export type OverlayShadowPolicy = Readonly<{
  widgetType: WidgetType;
  coverage: OverlayShadowCoverage;
  rules: readonly ShadowPolicyRule[];
}>;

const target = (path: string): QualitySelector => ({ kind: "target", path });
const source = (path: string): QualitySelector => ({ kind: "source", path });
const vehicle = (field: string): QualitySelector => ({ kind: "vehicle", field });
const playerVehicle = (field: string): QualitySelector => ({ kind: "player-vehicle", field });
const allOf = (...selectors: QualitySelector[]): QualityRequirement => ({ mode: "allOf", selectors });
const firstAvailable = (
  select: (snapshot: TelemetrySnapshot) => number,
  ...selectors: QualitySelector[]
): QualityRequirement => ({
  mode: "firstAvailable",
  selectors,
  select,
});
const numberDisclosure = { kind: "number" } as const;
const booleanDisclosure = { kind: "boolean" } as const;
const redactedDisclosure = { kind: "redacted" } as const;
const presenceDisclosure = { kind: "presence" } as const;
const statusDisclosure = { kind: "enum", allowed: RUNTIME_STATUSES } as const;

function scalar(
  path: string,
  read: ViewModelReader,
  disclosure: ShadowDisclosure,
  quality: QualityRequirement = allOf(),
  tolerance?: number,
): ScalarRule {
  return { kind: "scalar", path, read, quality, disclosure, tolerance };
}

function unsupported(path: string, ...sourcePaths: QualitySelector[]): UnsupportedRule {
  return { kind: "unsupported", path, sourcePaths };
}

const statusRules: readonly ScalarRule[] = [
  scalar("status", (model) => model.status, statusDisclosure),
  scalar("statusMessage", (model) => model.statusMessage, presenceDisclosure),
];

const controlsRules: readonly ScalarRule[] = [
  scalar("throttle", (model) => readNumber(model, "throttle"), numberDisclosure, allOf(target("player.throttle")), 1e-9),
  scalar("brake", (model) => readNumber(model, "brake"), numberDisclosure, allOf(target("player.brake")), 1e-9),
  scalar("clutch", (model) => readNumber(model, "clutch"), numberDisclosure, allOf(target("player.clutch")), 1e-9),
];

const extendedInputRules: readonly ScalarRule[] = [
  ...controlsRules,
  scalar("speedKph", (model) => readNumber(model, "speedKph"), numberDisclosure, allOf(target("player.speedKph")), 3.6e-6),
  scalar("rpm", (model) => readNumber(model, "rpm"), numberDisclosure, allOf(target("player.rpm")), 1e-6),
  scalar("gear", (model) => readNumber(model, "gear"), numberDisclosure, allOf(target("player.gear"))),
];

const speedUnitMismatch: DeclaredMismatchRule = {
  kind: "declared-mismatch",
  path: "speedKph.unit",
  quality: allOf(target("player.speedKph")),
};

const standingsRows: ListRule = {
  kind: "list",
  path: "rows",
  read: (model) => (model as StandingsViewModel).rows,
  identities: (rows) => rows.map((row) => (row as StandingsRowViewModel).id),
  orderSignificant: true,
  fields: [
    { path: "id", read: (row) => (row as StandingsRowViewModel).id, quality: allOf(vehicle("id")), disclosure: redactedDisclosure },
    { path: "position", read: (row) => (row as StandingsRowViewModel).position, quality: allOf(vehicle("position")), disclosure: numberDisclosure },
    { path: "currentLapText", read: (row) => (row as StandingsRowViewModel).currentLapText, quality: allOf(vehicle("completedLaps")), disclosure: redactedDisclosure },
    { path: "pitText", read: (row) => (row as StandingsRowViewModel).pitText, quality: allOf(vehicle("inPit")), disclosure: redactedDisclosure },
    { path: "isPlayer", read: (row) => (row as StandingsRowViewModel).isPlayer, quality: allOf(vehicle("id"), source("playerVehicleId")), disclosure: booleanDisclosure },
    { path: "isLeader", read: (row) => (row as StandingsRowViewModel).isLeader, quality: allOf(vehicle("position")), disclosure: booleanDisclosure },
    { path: "driverName", read: (row) => (row as StandingsRowViewModel).driverName, quality: allOf(vehicle("driverName")), disclosure: redactedDisclosure },
    { path: "vehicleClass", read: (row) => (row as StandingsRowViewModel).vehicleClass, quality: allOf(vehicle("vehicleClass")), disclosure: redactedDisclosure },
    { path: "intervalText", read: (row) => (row as StandingsRowViewModel).intervalText, quality: allOf(vehicle("timeBehindNextSeconds")), disclosure: redactedDisclosure },
    { path: "lastLapText", read: (row) => (row as StandingsRowViewModel).lastLapText, quality: allOf(vehicle("lastLapSeconds")), disclosure: redactedDisclosure },
    { path: "bestLapText", read: (row) => (row as StandingsRowViewModel).bestLapText, quality: allOf(vehicle("bestLapSeconds")), disclosure: redactedDisclosure },
  ],
};

const relativeRows: ListRule = {
  kind: "list",
  path: "rows",
  read: (model) => (model as RelativeViewModel).rows,
  identities: (rows) => rows.map((row) => (row as RelativeRowViewModel).id),
  orderSignificant: true,
  fields: [
    { path: "id", read: (row) => (row as RelativeRowViewModel).id, quality: allOf(vehicle("id")), disclosure: redactedDisclosure },
    { path: "position", read: (row) => (row as RelativeRowViewModel).position, quality: allOf(vehicle("position")), disclosure: numberDisclosure },
    { path: "vehicleClass", read: (row) => (row as RelativeRowViewModel).vehicleClass, quality: allOf(vehicle("vehicleClass")), disclosure: redactedDisclosure },
    { path: "driverName", read: (row) => (row as RelativeRowViewModel).driverName, quality: allOf(vehicle("driverName")), disclosure: redactedDisclosure },
    { path: "gapText", read: (row) => (row as RelativeRowViewModel).gapText, quality: allOf(vehicle("relativeTimeGapSeconds")), disclosure: redactedDisclosure },
    { path: "bestLapText", read: (row) => (row as RelativeRowViewModel).bestLapText, quality: allOf(vehicle("bestLapSeconds")), disclosure: redactedDisclosure },
    { path: "lastLapText", read: (row) => (row as RelativeRowViewModel).lastLapText, quality: allOf(vehicle("lastLapSeconds")), disclosure: redactedDisclosure },
    { path: "isPlayer", read: (row) => (row as RelativeRowViewModel).isPlayer, quality: allOf(vehicle("id"), source("playerVehicleId")), disclosure: booleanDisclosure },
    { path: "tone", read: (row) => (row as RelativeRowViewModel).tone, quality: allOf(vehicle("relativeTimeGapSeconds")), disclosure: redactedDisclosure },
    { path: "gapSeconds", read: (row) => (row as RelativeRowViewModel).gapSeconds, quality: allOf(vehicle("relativeTimeGapSeconds")), disclosure: numberDisclosure, tolerance: 1e-6 },
  ],
};

const deltaTracePoints: ListRule = {
  kind: "list",
  path: "points",
  read: (model) => (model as DeltaTraceViewModel).points,
  identities: (rows) => rows.map((row) => String((row as { capturedAt: number }).capturedAt)),
  orderSignificant: true,
  fields: [
    { path: "capturedAt", read: (row) => (row as { capturedAt: number }).capturedAt, quality: allOf(target("derived.deltaHistory")), disclosure: numberDisclosure },
    { path: "deltaSeconds", read: (row) => (row as { deltaSeconds: number }).deltaSeconds, quality: allOf(target("derived.deltaHistory")), disclosure: numberDisclosure, tolerance: 1e-6 },
  ],
};

const multiclassRelativeRows: ListRule = {
  kind: "list",
  path: "rows",
  read: (model) => (model as MulticlassRelativeViewModel).rows,
  identities: (rows, snapshot) => {
    const identities = rows.map((row) => {
      const place = (row as MulticlassRelativeRow).place;
      const scoring = snapshot.scoring.find(
        (candidate) => readScoringNumber(candidate, "place") === place,
      );
      return scoring === undefined ? undefined : scoringIdentity(scoring);
    });
    return identities.every((identity): identity is string => identity !== undefined)
      ? identities
      : undefined;
  },
  orderSignificant: true,
  fields: [
    { path: "place", read: (row) => (row as MulticlassRelativeRow).place, quality: allOf(vehicle("position")), disclosure: numberDisclosure },
    { path: "classId", read: (row) => (row as MulticlassRelativeRow).classId, quality: allOf(vehicle("vehicleClass")), disclosure: redactedDisclosure },
    { path: "name", read: (row) => (row as MulticlassRelativeRow).name, quality: allOf(vehicle("driverName")), disclosure: redactedDisclosure },
    { path: "gap", read: (row) => (row as MulticlassRelativeRow).gap, quality: allOf(vehicle("relativeTimeGapSeconds")), disclosure: numberDisclosure, tolerance: 1e-6 },
    { path: "isPlayer", read: (row) => (row as MulticlassRelativeRow).isPlayer, quality: allOf(vehicle("id"), source("playerVehicleId")), disclosure: booleanDisclosure },
  ],
};

const broadcastRows: ListRule = {
  kind: "list",
  path: "rows",
  read: (model) => (model as BroadcastTowerViewModel).rows,
  identities: broadcastIdentities,
  orderSignificant: true,
  fields: [
    { path: "place", read: (row) => (row as BroadcastTowerRow).place, quality: allOf(vehicle("position")), disclosure: numberDisclosure },
    { path: "name", read: (row) => (row as BroadcastTowerRow).name, quality: allOf(vehicle("driverName")), disclosure: redactedDisclosure },
    { path: "className", read: (row) => (row as BroadcastTowerRow).className, quality: allOf(vehicle("vehicleClass")), disclosure: redactedDisclosure },
    { path: "gap", read: (row) => (row as BroadcastTowerRow).gap, quality: allOf(vehicle("relativeTimeGapSeconds")), disclosure: numberDisclosure, tolerance: 1e-6 },
    { path: "isPlayer", read: (row) => (row as BroadcastTowerRow).isPlayer, quality: allOf(vehicle("id"), source("playerVehicleId")), disclosure: booleanDisclosure },
  ],
};

export const OVERLAY_SHADOW_POLICIES = {
  delta: {
    widgetType: "delta",
    coverage: "exact",
    rules: [
      ...statusRules,
      scalar("tone", (model) => (model as DeltaViewModel).tone, redactedDisclosure, allOf(target("player.deltaSeconds"))),
      scalar("deltaText", (model) => (model as DeltaViewModel).deltaText, redactedDisclosure, allOf(target("player.deltaSeconds"))),
      scalar("lastLapText", (model) => (model as DeltaViewModel).lastLapText, redactedDisclosure, allOf(target("player.lastLapSeconds"))),
      scalar("bestLapText", (model) => (model as DeltaViewModel).bestLapText, redactedDisclosure, allOf(target("player.bestLapSeconds"))),
      scalar("progress", (model) => (model as DeltaViewModel).progress, numberDisclosure, allOf(target("player.deltaSeconds")), 1e-6),
      scalar("lapText", (model) => (model as DeltaViewModel).lapText, redactedDisclosure, firstAvailable(
        (snapshot) => snapshot.player.lapNumber === undefined ? 1 : 0,
        target("player.lapNumber"),
        target("player.totalLaps"),
      )),
      scalar("predictedLapText", (model) => (model as DeltaViewModel).predictedLapText, redactedDisclosure, allOf(target("player.predictedLapSeconds"))),
      scalar("splitText", (model) => (model as DeltaViewModel).splitText, redactedDisclosure, allOf(target("player.deltaSeconds"))),
    ],
  },
  standings: {
    widgetType: "standings",
    coverage: "partial",
    rules: [
      ...statusRules,
      scalar("sessionLabel", (model) => (model as StandingsViewModel).sessionLabel, redactedDisclosure, allOf(target("session.type"))),
      standingsRows,
      scalar("activeClass", (model) => (model as StandingsViewModel).activeClass, redactedDisclosure, allOf(target("scoring[].vehicleClass"))),
      scalar("remainingText", (model) => (model as StandingsViewModel).remainingText, redactedDisclosure, allOf(target("session.remainingSeconds"))),
      unsupported("rows[].driverNumber", target("scoring[].driverNumber")),
      unsupported("rows[].teamCode", target("scoring[].teamCode")),
      unsupported("rows[].teamBrandColor", target("scoring[].teamBrandColor")),
      unsupported(
        "rows[].gapText",
        target("session.type"),
        target("scoring[].id"),
        target("scoring[].place"),
        target("scoring[].vehicleClass"),
        target("scoring[].isPlayer"),
        target("scoring[].bestLapTime"),
        target("scoring[].fastestLap"),
        target("scoring[].lapsBehindLeader"),
        target("scoring[].timeBehindLeader"),
      ),
      unsupported("rows[].tireCompound", target("scoring[].tireCompound")),
    ],
  },
  relative: {
    widgetType: "relative",
    coverage: "partial",
    rules: [
      ...statusRules,
      relativeRows,
      unsupported("rows[].driverNumber", target("scoring[].driverNumber")),
    ],
  },
  pedals: {
    widgetType: "pedals",
    coverage: "exact",
    rules: [
      ...statusRules,
      ...controlsRules,
      scalar("throttleText", (model) => readString(model, "throttleText"), redactedDisclosure, allOf(target("player.throttle"))),
      scalar("brakeText", (model) => readString(model, "brakeText"), redactedDisclosure, allOf(target("player.brake"))),
      scalar("clutchText", (model) => readString(model, "clutchText"), redactedDisclosure, allOf(target("player.clutch"))),
    ],
  },
  "broadcast-tower": {
    widgetType: "broadcast-tower",
    coverage: "partial",
    rules: [
      ...statusRules,
      scalar("sessionLabel", (model) => (model as BroadcastTowerViewModel).sessionLabel, redactedDisclosure, allOf(target("session.type"))),
      scalar("lap", (model) => (model as BroadcastTowerViewModel).lap, numberDisclosure, firstAvailable(
        (snapshot) => snapshot.player.lapNumber === undefined ? 1 : 0,
        target("player.lapNumber"),
        target("player.totalLaps"),
      )),
      scalar("totalLaps", (model) => (model as BroadcastTowerViewModel).totalLaps, numberDisclosure, allOf(target("player.totalLaps"))),
      broadcastRows,
      unsupported("trackTempC", target("environment.trackC")),
      unsupported("sof", target("scoring[].rating")),
      ...["number", "team", "brandColor"].map((path) => unsupported(`rows[].${path}`, target(`scoring[].${path}`))),
    ],
  },
  "fuel-strategy": {
    widgetType: "fuel-strategy",
    coverage: "partial",
    rules: [
      ...statusRules,
      scalar("fuelLiters", (model) => (model as FuelStrategyViewModel).fuelLiters, numberDisclosure, allOf(target("player.fuelLiters")), 1e-6),
      scalar("lapsRemaining", (model) => (model as FuelStrategyViewModel).lapsRemaining, numberDisclosure, allOf(target("session.remainingSeconds"), target("player.lastLapSeconds"))),
      unsupported("fuelPercent", target("player.fuelLiters")),
      unsupported("avgPerLap", target("derived.fuelHistory")),
      unsupported("requiredFuel", target("derived.fuelHistory")),
      unsupported("history", target("derived.fuelHistory")),
    ],
  },
  "pedals-telemetry": {
    widgetType: "pedals-telemetry",
    coverage: "partial",
    rules: [
      ...statusRules,
      ...extendedInputRules,
      speedUnitMismatch,
      scalar("playerPosition", (model) => readNumber(model, "playerPosition"), numberDisclosure, allOf(playerVehicle("position"))),
      scalar("speedText", (model) => readString(model, "speedText"), redactedDisclosure, allOf(target("player.speedKph"))),
      scalar("rpmText", (model) => readString(model, "rpmText"), redactedDisclosure, allOf(target("player.rpm"))),
      scalar("gearText", (model) => readString(model, "gearText"), redactedDisclosure, allOf(target("player.gear"))),
      scalar("positionText", (model) => readString(model, "positionText"), redactedDisclosure, allOf(playerVehicle("position"))),
    ],
  },
  "pedals-telemetry-compact": {
    widgetType: "pedals-telemetry-compact",
    coverage: "partial",
    rules: [
      ...statusRules,
      ...extendedInputRules,
      speedUnitMismatch,
      scalar("speedText", (model) => readString(model, "speedText"), redactedDisclosure, allOf(target("player.speedKph"))),
      scalar("rpmText", (model) => readString(model, "rpmText"), redactedDisclosure, allOf(target("player.rpm"))),
      scalar("gearText", (model) => readString(model, "gearText"), redactedDisclosure, allOf(target("player.gear"))),
    ],
  },
  "racing-flags": {
    widgetType: "racing-flags",
    coverage: "not-comparable",
    rules: ["globalFlag", "sectorFlags", "message", "hidden"].map((path) => unsupported(path, target("session.globalFlag"))),
  },
  "delta-trace": {
    widgetType: "delta-trace",
    coverage: "partial",
    rules: [
      ...statusRules,
      deltaTracePoints,
      scalar("currentDelta", (model) => (model as DeltaTraceViewModel).currentDelta, numberDisclosure, allOf(target("derived.deltaHistory")), 1e-6),
      scalar("trend", (model) => (model as DeltaTraceViewModel).trend, redactedDisclosure, allOf(target("derived.deltaHistory"))),
      unsupported("sectorDeltas", target("derived.deltaHistory")),
      unsupported("turnInsight", target("derived.deltaHistory")),
      unsupported("trackPath", target("derived.deltaHistory")),
    ],
  },
  "race-schedule": {
    widgetType: "race-schedule",
    coverage: "external",
    rules: [{ kind: "external", path: "events" }],
  },
  "engineer-radio": {
    widgetType: "engineer-radio",
    coverage: "external",
    rules: [{ kind: "external", path: "engineerPresentation" }],
  },
  "head-to-head": {
    widgetType: "head-to-head",
    coverage: "not-comparable",
    rules: [
      ...statusRules,
      unsupported("player.place", target("scoring[].place")),
      unsupported("player.name", target("scoring[].driverName")),
      unsupported("player.className", target("scoring[].vehicleClass")),
      unsupported("opponent.place", target("scoring[].place")),
      unsupported("opponent.name", target("scoring[].driverName")),
      unsupported("opponent.className", target("scoring[].vehicleClass")),
      unsupported("gapSeconds", target("scoring[].timeGapToPlayer")),
      unsupported("player.number", target("scoring[].driverNumber")),
      unsupported("player.team", target("scoring[].teamName")),
      unsupported("opponent.number", target("scoring[].driverNumber")),
      unsupported("opponent.team", target("scoring[].teamName")),
      unsupported("ahead", target("scoring[].timeGapToPlayer")),
      unsupported("behind", target("scoring[].timeGapToPlayer")),
      unsupported("sectorComparisons", target("scoring[].sectorComparisons")),
    ],
  },
  "delta-advanced": {
    widgetType: "delta-advanced",
    coverage: "partial",
    rules: [
      ...statusRules,
      scalar("best", (model) => (model as DeltaAdvancedViewModel).best, numberDisclosure, allOf(target("player.deltaSeconds")), 1e-6),
      scalar("availability.best", (model) => (model as DeltaAdvancedViewModel).availability.best, booleanDisclosure, allOf(target("player.deltaSeconds"))),
      unsupported("sector", target("player.deltaSeconds")),
      unsupported("theoretical", target("player.deltaSeconds")),
      unsupported("last", target("player.deltaSeconds")),
      unsupported("availability.sector", target("player.deltaSeconds")),
      unsupported("availability.theoretical", target("player.deltaSeconds")),
      unsupported("availability.last", target("player.deltaSeconds")),
    ],
  },
  "input-telemetry": {
    widgetType: "input-telemetry",
    coverage: "partial",
    rules: [
      ...statusRules,
      ...extendedInputRules,
      speedUnitMismatch,
      unsupported("history", source("controlsHistory")),
    ],
  },
  "multiclass-relative": {
    widgetType: "multiclass-relative",
    coverage: "partial",
    rules: [
      ...statusRules,
      multiclassRelativeRows,
      unsupported("rows[].classColor", target("scoring[].teamBrandColor")),
      unsupported("rows[].number", target("scoring[].driverNumber")),
    ],
  },
  "track-map": {
    widgetType: "track-map",
    coverage: "partial",
    rules: [
      ...statusRules,
      scalar("trackLabel", (model) => (model as TrackMapViewModel).trackLabel, presenceDisclosure, allOf(target("session.trackName"))),
      scalar("synthetic", (model) => (model as TrackMapViewModel).synthetic, booleanDisclosure, allOf(target("session.trackName"))),
      scalar("unavailableReason", (model) => (model as TrackMapViewModel).unavailableReason, redactedDisclosure, allOf(target("session.trackName"))),
      // The outline is a static build asset keyed by track name, not telemetry,
      // so there is nothing for the shadow comparator to reconcile.
      unsupported("outlinePath", target("session.trackName")),
      unsupported("viewBox", target("session.trackName")),
      unsupported("showTrackLabel", target("session.trackName")),
    ],
  },
  "track-weather": {
    widgetType: "track-weather",
    coverage: "not-comparable",
    rules: ["ambientC", "trackC", "rainPercent", "wetnessPercent", "windKph", "windDirection", "pressureHpa"].map((path) => unsupported(path, target("environment"))),
  },
  "car-damage-visual": {
    widgetType: "car-damage-visual",
    coverage: "not-comparable",
    rules: ["body", "aero", "suspension", "tyres"].map((path) => unsupported(path, target("damage"))),
  },
  "car-damage-numbers": {
    widgetType: "car-damage-numbers",
    coverage: "not-comparable",
    rules: ["body", "aero", "suspension", "tyres"].map((path) => unsupported(path, target("damage"))),
  },
} satisfies Record<WidgetType, OverlayShadowPolicy>;

export function compareOverlayShadow(input: Readonly<{
  legacySnapshot: TelemetrySnapshot;
  projection: OverlayProjectionAdaptation;
  widgets: readonly WidgetInstanceV3[];
  maxEntries?: number;
}>): OverlayShadowReport {
  const allSorted = input.widgets
    .map((widget, originalIndex) => ({ widget, originalIndex }))
    .sort((left, right) =>
      left.widget.type.localeCompare(right.widget.type) || left.originalIndex - right.originalIndex,
    );
  const sorted = allSorted.slice(0, MAX_WIDGETS);
  const instanceCounts = new Map<WidgetType, number>();
  const fullResults = sorted.map(({ widget }) => {
    const instance = instanceCounts.get(widget.type) ?? 0;
    instanceCounts.set(widget.type, instance + 1);
    return compareWidget(widget, instance, input.legacySnapshot, input.projection);
  });
  const mismatchResults = selectEntries(fullResults, true);
  const sampleResults = selectEntries(fullResults, false);
  const mismatchBounded = limitShadowEntries(
    mismatchResults.flatMap((result) => result.entries),
    input.maxEntries,
  );
  const sampleBounded = limitShadowEntries(
    sampleResults.flatMap((result) => result.entries),
    MAX_NON_MISMATCH_SAMPLES,
  );
  const visibleMismatches = allocateEntries(
    mismatchResults,
    mismatchBounded.entries.length,
  );
  const visibleSamples = allocateEntries(
    sampleResults,
    sampleBounded.entries.length,
  );
  const widgets = fullResults.map((result, index) => ({
    ...result,
    entries: [...visibleMismatches[index], ...visibleSamples[index]].sort(compareEntries),
  }));
  const summary = addCounts(fullResults.map((result) => result.summary));
  return {
    contractVersion: CONTRACT_VERSION,
    summary: { widgets: widgets.length, ...summary },
    widgets,
    truncated:
      allSorted.length > sorted.length ||
      mismatchBounded.truncated ||
      sampleBounded.truncated,
  };
}

function selectEntries(
  results: readonly OverlayShadowWidgetResult[],
  mismatches: boolean,
): readonly OverlayShadowWidgetResult[] {
  return results.map((result) => ({
    ...result,
    entries: result.entries.filter((entry) =>
      isMismatch(entry.classification) === mismatches
    ),
  }));
}

function allocateEntries(
  results: readonly OverlayShadowWidgetResult[],
  limit: number,
): readonly (readonly OverlayShadowEntry[])[] {
  const visible = results.map(() => [] as OverlayShadowEntry[]);
  let remaining = limit;
  let entryIndex = 0;
  while (remaining > 0) {
    let added = false;
    for (let resultIndex = 0; resultIndex < results.length && remaining > 0; resultIndex += 1) {
      const entry = results[resultIndex].entries[entryIndex];
      if (!entry) continue;
      visible[resultIndex].push(entry);
      remaining -= 1;
      added = true;
    }
    if (!added) break;
    entryIndex += 1;
  }
  return visible;
}

function compareWidget(
  widget: WidgetInstanceV3,
  instance: number,
  legacySnapshot: TelemetrySnapshot,
  projection: OverlayProjectionAdaptation,
): OverlayShadowWidgetResult {
  const policy = OVERLAY_SHADOW_POLICIES[widget.type];
  if (projection.kind === "blocked") {
    const entry = policy.coverage === "external"
      ? makeEntry("events", "external-consumer", "external", [])
      : makeEntry("mapping", "shape-mismatch", "blocked", []);
    return finishWidget(policy, instance, [entry], policy.coverage === "external" ? "external" : "blocked");
  }

  let models: Readonly<{ legacy: WidgetViewModelBase; projection: WidgetViewModelBase }>;
  try {
    models = buildViewModelPair(widget, legacySnapshot, projection.snapshot);
  } catch {
    return finishWidget(
      policy,
      instance,
      [makeEntry("builder", "builder-error", "builder", [])],
      "builder-error",
    );
  }

  const entries = policy.rules.flatMap((rule) =>
    compareRule(
      rule,
      models.legacy,
      models.projection,
      legacySnapshot,
      projection,
    ),
  );
  entries.sort(compareEntries);
  const outcome = policy.coverage === "external"
    ? "external"
    : policy.coverage === "not-comparable"
      ? "not-comparable"
      : policy.coverage === "partial" || entries.some((entry) => isMismatch(entry.classification))
        ? "mismatch"
        : "equal";
  return finishWidget(policy, instance, entries, outcome);
}

function buildViewModelPair(
  widget: WidgetInstanceV3,
  legacySnapshot: TelemetrySnapshot,
  projectionSnapshot: TelemetrySnapshot,
): Readonly<{ legacy: WidgetViewModelBase; projection: WidgetViewModelBase }> {
  const definition = widgetTypeRegistry.get(widget.type);
  const parsedContent = definition.parseContent(widget.content);
  if (widget.type === "input-telemetry") {
    const content = parsedContent as InputTelemetryContent;
    return {
      legacy: buildInputTelemetryViewModel(legacySnapshot, content, inputHistory(legacySnapshot)),
      projection: buildInputTelemetryViewModel(projectionSnapshot, content, []),
    };
  }
  return {
    legacy: definition.buildViewModel(legacySnapshot, parsedContent),
    projection: definition.buildViewModel(projectionSnapshot, parsedContent),
  };
}

function inputHistory(snapshot: TelemetrySnapshot): readonly InputTelemetrySample[] {
  return (snapshot.derived?.inputHistory ?? []).slice(-INPUT_HISTORY_LIMIT).map((item) => ({
    capturedAt: item.capturedAt,
    throttle: item.throttle ?? 0,
    brake: item.brake ?? 0,
    clutch: item.clutch ?? 0,
  }));
}

function compareRule(
  rule: ShadowPolicyRule,
  legacy: WidgetViewModelBase,
  projectionModel: WidgetViewModelBase,
  legacySnapshot: TelemetrySnapshot,
  projection: OverlayProjectionMapping,
): OverlayShadowEntry[] {
  switch (rule.kind) {
    case "scalar":
      return [compareScalarRule(rule, legacy, projectionModel, projection)];
    case "list":
      return compareListRule(
        rule,
        legacy,
        projectionModel,
        legacySnapshot,
        projection,
      );
    case "unsupported":
      return [makeEntry(rule.path, "unsupported-by-projection", "unsupported", sourceLabels(rule.sourcePaths))];
    case "declared-mismatch": {
      const qualityClassification = classifyQuality(rule.quality, projection);
      return [makeEntry(
        rule.path,
        qualityClassification ?? "value-mismatch",
        "unit-contract",
        sourceLabels(rule.quality),
      )];
    }
    case "external":
      return [makeEntry(rule.path, "external-consumer", "external", [])];
  }
}

function compareScalarRule(
  rule: ScalarRule,
  legacy: WidgetViewModelBase,
  projectionModel: WidgetViewModelBase,
  projection: OverlayProjectionMapping,
): OverlayShadowEntry {
  let legacyValue: ShadowScalar;
  let projectionValue: ShadowScalar;
  try {
    legacyValue = rule.read(legacy);
    projectionValue = rule.read(projectionModel);
  } catch {
    return makeEntry(rule.path, "shape-mismatch", "exact", sourceLabels(rule.quality));
  }
  return compareScalarValues(
    rule.path,
    legacyValue,
    projectionValue,
    rule.quality,
    rule.disclosure,
    projection,
    rule.tolerance,
  );
}

function compareListRule(
  rule: ListRule,
  legacy: WidgetViewModelBase,
  projectionModel: WidgetViewModelBase,
  legacySnapshot: TelemetrySnapshot,
  projection: OverlayProjectionMapping,
): OverlayShadowEntry[] {
  let legacyRows: readonly unknown[];
  let projectionRows: readonly unknown[];
  try {
    legacyRows = rule.read(legacy).slice(0, MAX_LIST_ITEMS);
    projectionRows = rule.read(projectionModel).slice(0, MAX_LIST_ITEMS);
  } catch {
    return [makeEntry(`${rule.path}.shape`, "shape-mismatch", "list-shape", [])];
  }

  const entries: OverlayShadowEntry[] = [];
  entries.push(makeEntry(
    `${rule.path}.length`,
    legacyRows.length === projectionRows.length ? "equal" : "shape-mismatch",
    "list-shape",
    [],
    undefined,
    undefined,
    sanitizeShadowObservation(legacyRows.length, projectionRows.length, numberDisclosure),
  ));
  const legacyIdentities = rule.identities(legacyRows, legacySnapshot);
  const projectionIdentities = rule.identities(projectionRows, projection.snapshot);
  const legacyIndex = indexRows(legacyRows, legacyIdentities);
  const projectionIndex = indexRows(projectionRows, projectionIdentities);
  if (!legacyIndex || !projectionIndex) {
    entries.push(makeEntry(`${rule.path}.identity`, "shape-mismatch", "list-shape", []));
    return entries;
  }
  const legacyOrder = [...legacyIndex.keys()];
  const projectionOrder = [...projectionIndex.keys()];
  if (rule.orderSignificant) {
    const classification = sameOrder(legacyOrder, projectionOrder) ? "equal" : "shape-mismatch";
    entries.push(makeEntry(
      `${rule.path}.order`,
      classification,
      "list-shape",
      [],
      undefined,
      undefined,
      sanitizeShadowObservation(legacyOrder.join("|"), projectionOrder.join("|"), redactedDisclosure),
    ));
  }
  legacyOrder.forEach((identity, item) => {
    const legacyRow = legacyIndex.get(identity);
    const projectionRow = projectionIndex.get(identity);
    if (!legacyRow || !projectionRow) return;
    const projectionVehicleIndex = scoringIndexByIdentity(projection.snapshot, identity);
    for (const field of rule.fields) {
      entries.push(compareScalarValues(
        `${rule.path}[].${field.path}`,
        field.read(legacyRow),
        field.read(projectionRow),
        field.quality,
        field.disclosure,
        projection,
        field.tolerance,
        item,
        projectionVehicleIndex,
      ));
    }
  });
  return entries;
}

function compareScalarValues(
  path: string,
  legacy: ShadowScalar,
  projectionValue: ShadowScalar,
  quality: QualityRequirement,
  disclosure: ShadowDisclosure,
  projection: OverlayProjectionMapping,
  tolerance?: number,
  item?: number,
  projectionVehicleIndex?: number,
): OverlayShadowEntry {
  const qualityClassification = classifyQuality(
    quality,
    projection,
    projectionVehicleIndex,
  );
  const paths = sourceLabels(quality);
  const observation = sanitizeShadowObservation(legacy, projectionValue, disclosure);
  if (qualityClassification) {
    return makeEntry(path, qualityClassification, tolerance === undefined ? "exact" : "absolute-tolerance", paths, tolerance, item, observation);
  }
  if (legacy === undefined && projectionValue !== undefined) {
    return makeEntry(path, "missing-legacy", "exact", paths, tolerance, item, observation);
  }
  if (legacy !== undefined && projectionValue === undefined) {
    return makeEntry(path, "missing-projection", "exact", paths, tolerance, item, observation);
  }
  if (!isScalar(legacy) || !isScalar(projectionValue)) {
    return makeEntry(path, "shape-mismatch", "exact", paths, tolerance, item);
  }
  if (
    (typeof legacy === "number" && !Number.isFinite(legacy)) ||
    (typeof projectionValue === "number" && !Number.isFinite(projectionValue))
  ) {
    return makeEntry(path, "shape-mismatch", "exact", paths, tolerance, item);
  }
  if (Object.is(legacy, projectionValue)) {
    return makeEntry(path, "equal", tolerance === undefined ? "exact" : "absolute-tolerance", paths, tolerance, item, observation);
  }
  if (
    tolerance !== undefined &&
    typeof legacy === "number" &&
    typeof projectionValue === "number" &&
    Number.isFinite(legacy) &&
    Number.isFinite(projectionValue) &&
    Math.abs(legacy - projectionValue) <= tolerance
  ) {
    return makeEntry(path, "within-tolerance", "absolute-tolerance", paths, tolerance, item, observation);
  }
  return makeEntry(path, "value-mismatch", tolerance === undefined ? "exact" : "absolute-tolerance", paths, tolerance, item, observation);
}

function classifyQuality(
  requirement: QualityRequirement,
  projection: OverlayProjectionMapping,
  projectionVehicleIndex?: number,
): "missing-projection" | "stale-projection" | "invalid-projection" | "value-mismatch" | undefined {
  if (requirement.selectors.length === 0) return undefined;
  const states = requirement.selectors.map((selector) =>
    classifyQualitySelector(
      selector,
      projection,
      projectionVehicleIndex,
    ),
  );
  if (requirement.mode === "firstAvailable") {
    const selectedIndex = requirement.select(projection.snapshot);
    return selectedIndex >= 0 && selectedIndex < states.length
      ? states[selectedIndex]
      : "missing-projection";
  }
  if (requirement.mode === "anyOf") {
    return states.reduce((best, state) =>
      qualityRank(state) < qualityRank(best) ? state : best
    );
  }
  return states.reduce((worst, state) =>
    qualityRank(state) > qualityRank(worst) ? state : worst
  );
}

function indexRows(
  rows: readonly unknown[],
  identities: readonly string[] | undefined,
): Map<string, unknown> | undefined {
  if (!identities || identities.length !== rows.length) return undefined;
  const result = new Map<string, unknown>();
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const key = identities[index];
    if (row === undefined || key === undefined) return undefined;
    if (key.trim() === "" || result.has(key)) return undefined;
    result.set(key, row);
  }
  return result;
}

function sameOrder(legacy: readonly string[], projection: readonly string[]): boolean {
  return legacy.length === projection.length && legacy.every((value, index) => value === projection[index]);
}

function broadcastIdentities(
  rows: readonly unknown[],
  snapshot: TelemetrySnapshot,
): readonly string[] | undefined {
  const identities = [...snapshot.scoring]
    .sort(
      (left, right) =>
        (readScoringNumber(left, "place") ?? 99) -
        (readScoringNumber(right, "place") ?? 99),
    )
    .slice(0, rows.length)
    .map(scoringIdentity);
  return identities.every((identity): identity is string => identity !== undefined)
    ? identities
    : undefined;
}

function scoringIdentity(row: Record<string, unknown>): string | undefined {
  return readScoringString(row, "id") ??
    readScoringNumber(row, "id")?.toString();
}

function scoringIndexByIdentity(
  snapshot: TelemetrySnapshot,
  identity: string,
): number | undefined {
  const index = snapshot.scoring.findIndex(
    (row) => scoringIdentity(row) === identity,
  );
  return index < 0 ? undefined : index;
}

function classifyQualitySelector(
  selector: QualitySelector,
  projection: OverlayProjectionMapping,
  projectionVehicleIndex?: number,
): "missing-projection" | "stale-projection" | "invalid-projection" | "value-mismatch" | undefined {
  const matches = qualityMatches(selector, projection, projectionVehicleIndex);
  if (matches.length === 0) return "missing-projection";
  if (matches.some((field) => field.freshness === "invalid")) return "invalid-projection";
  if (matches.some((field) =>
    !field.present || field.freshness === "missing" || !field.usable
  )) return "missing-projection";
  if (matches.some((field) => field.freshness === "stale")) return "stale-projection";
  if (matches.some((field) => field.provenance === "estimated")) return "value-mismatch";
  return undefined;
}

function qualityMatches(
  selector: QualitySelector,
  projection: OverlayProjectionMapping,
  projectionVehicleIndex?: number,
): readonly OverlayProjectionMapping["quality"][number][] {
  const sourcePath = selector.kind === "vehicle"
    ? projectionVehicleIndex === undefined
      ? undefined
      : `vehicles[${projectionVehicleIndex}].${selector.field}`
    : selector.kind === "player-vehicle"
      ? playerVehicleSourcePath(projection.snapshot, selector.field)
      : selector.kind === "source"
        ? selector.path
        : undefined;
  return projection.quality.filter((field) =>
    selector.kind === "target"
      ? field.targetPath === selector.path
      : sourcePath !== undefined && field.sourcePath === sourcePath,
  );
}

function playerVehicleSourcePath(
  snapshot: TelemetrySnapshot,
  field: string,
): string | undefined {
  const index = snapshot.scoring.findIndex(
    (row) => readScoringBoolean(row, "isPlayer") === true,
  );
  return index < 0 ? undefined : `vehicles[${index}].${field}`;
}

function qualityRank(
  value: "missing-projection" | "stale-projection" | "invalid-projection" | "value-mismatch" | undefined,
): number {
  switch (value) {
    case undefined:
      return 0;
    case "value-mismatch":
      return 1;
    case "stale-projection":
      return 2;
    case "missing-projection":
      return 3;
    case "invalid-projection":
      return 4;
  }
}

function selectorPath(selector: QualitySelector): string {
  switch (selector.kind) {
    case "target":
    case "source":
      return selector.path;
    case "vehicle":
    case "player-vehicle":
      return `vehicles[].${selector.field}`;
  }
}

function sourceLabels(
  dependency: QualityRequirement | readonly QualitySelector[],
): string[] {
  const selectors = "selectors" in dependency ? dependency.selectors : dependency;
  return selectors.map((selector) => sanitizeShadowPath(selectorPath(selector)));
}

function makeEntry(
  path: string,
  classification: OverlayShadowClassification,
  rule: OverlayShadowRuleCode,
  sourcePaths: readonly string[],
  tolerance?: number,
  item?: number,
  observation?: SanitizedShadowObservation,
): OverlayShadowEntry {
  return {
    path: sanitizeShadowPath(path),
    classification,
    rule,
    sourcePaths,
    ...(tolerance === undefined ? {} : { tolerance }),
    ...(item === undefined ? {} : { item }),
    ...(observation === undefined ? {} : { observation }),
  };
}

function finishWidget(
  policy: OverlayShadowPolicy,
  instance: number,
  entries: readonly OverlayShadowEntry[],
  outcome: OverlayShadowWidgetResult["outcome"],
): OverlayShadowWidgetResult {
  const sortedEntries = [...entries].sort(compareEntries);
  return {
    widgetType: policy.widgetType,
    instance,
    coverage: policy.coverage,
    outcome,
    summary: countEntries(sortedEntries),
    entries: sortedEntries,
  };
}

function countEntries(entries: readonly OverlayShadowEntry[]): OverlayShadowCounts {
  return {
    fields: entries.length,
    equal: entries.filter((entry) => entry.classification === "equal").length,
    withinTolerance: entries.filter((entry) => entry.classification === "within-tolerance").length,
    mismatches: entries.filter((entry) => isMismatch(entry.classification)).length,
    external: entries.filter((entry) => entry.classification === "external-consumer").length,
  };
}

function addCounts(counts: readonly OverlayShadowCounts[]): OverlayShadowCounts {
  return counts.reduce<OverlayShadowCounts>(
    (total, value) => ({
      fields: total.fields + value.fields,
      equal: total.equal + value.equal,
      withinTolerance: total.withinTolerance + value.withinTolerance,
      mismatches: total.mismatches + value.mismatches,
      external: total.external + value.external,
    }),
    { fields: 0, equal: 0, withinTolerance: 0, mismatches: 0, external: 0 },
  );
}

function isMismatch(classification: OverlayShadowClassification): boolean {
  return classification !== "equal" && classification !== "within-tolerance" && classification !== "external-consumer";
}

function compareEntries(left: OverlayShadowEntry, right: OverlayShadowEntry): number {
  return left.path.localeCompare(right.path) || (left.item ?? -1) - (right.item ?? -1) || left.classification.localeCompare(right.classification);
}

function readNumber(model: WidgetViewModelBase, key: string): number | undefined {
  const value = (model as unknown as Record<string, unknown>)[key];
  return typeof value === "number" ? value : undefined;
}

function readString(model: WidgetViewModelBase, key: string): string | undefined {
  const value = (model as unknown as Record<string, unknown>)[key];
  return typeof value === "string" ? value : undefined;
}

function isScalar(value: unknown): value is ShadowScalar {
  return value === undefined || value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}
