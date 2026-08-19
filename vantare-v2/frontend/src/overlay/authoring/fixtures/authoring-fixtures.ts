import { getAnimationScene, sceneFrameAt, type SceneFrame } from "./animation-scenes";
import { buildMockTelemetry } from "../../core/mock-scenarios";
import type {
  MockDataState,
  MockLocationScenario,
  MockSessionScenario,
} from "../../core/mock-scenarios";
import { ALL_WIDGET_TYPES, type WidgetType, type DesignSystemId, type WidgetInstanceV3 } from "../../core/profile-document";
import type { TelemetrySnapshot } from "../../core/telemetry-snapshot";
import { widgetTypeRegistry } from "../../core/widget-registry";
import { applyWidgetDesign } from "../../core/widget-design";
import { getOfficialDesign } from "../../design-systems/official-designs";
import type { InputTelemetryContent } from "../../widget-types/input-telemetry/input-telemetry-definition";
import {
  clearInputTelemetryHistory,
  recordInputTelemetrySample,
  type InputTelemetrySample,
} from "../../widget-types/input-telemetry/input-telemetry-accumulator";
import { buildInputTelemetryViewModel } from "../../widget-types/input-telemetry/input-telemetry-view-model";
import { parseRelativeContent, updateRelativeFilters } from "../../widget-types/relative/relative-content";
import crystalReferenceManifest from "../../../../testdata/crystal-reference/manifest.json";
import { buildEngineerPresentationFixture } from "../../../engineer/engineer-presentation-fixtures";

export type HarnessWidget = WidgetType;
export type AuthoringFixtureWidget = WidgetType;
export type AuthoringFixtureSystem = DesignSystemId;
export type AuthoringFixtureState = MockDataState;
export type AuthoringFixtureSession = MockSessionScenario;
export type AuthoringFixtureLocation = MockLocationScenario;
export type AuthoringFixtureSurface = "studio" | "desktop" | "obs" | "harness";
export type CrystalHarnessDesign = {
  id: string;
  widgetType: WidgetType;
  designId: string;
  width: number;
  height: number;
  htmlSection: number;
};
export type CrystalHarnessDesignId = CrystalHarnessDesign["designId"];

export const CRYSTAL_HARNESS_DESIGNS: readonly CrystalHarnessDesign[] =
  crystalReferenceManifest.entries.map((entry) => ({
    id: entry.id,
    widgetType: entry.widgetType as WidgetType,
    designId: entry.designId,
    width: entry.width,
    height: entry.height,
    htmlSection: entry.htmlSection,
  }));

/** HTML parity only: deliberately excludes Engineer Radio. */
export const AUTHORING_HISTORICAL_CRYSTAL_DESIGNS = CRYSTAL_HARNESS_DESIGNS;

/** Product catalog only: Engineer Radio is not a historical HTML Crystal design. */
export const AUTHORING_ENGINEER_CONTRACT_DESIGNS = [
  { id: "engineer-radio-crystal", widgetType: "engineer-radio", designId: "engineer-radio-crystal" },
] as const;

export function getCrystalHarnessDesign(designId: string): CrystalHarnessDesign | undefined {
  return CRYSTAL_HARNESS_DESIGNS.find((design) => design.designId === designId);
}
export type HarnessVariant =
  | "default"
  | "relative-fill"
  | "relative-multiclass"
  | "standings-stress60"
  | "standings-multiclass"
  | "standings-replay"
  | "pedals-zero"
  | "pedals-full";

export const AUTHORING_WIDGET_TYPES: readonly AuthoringFixtureWidget[] = ALL_WIDGET_TYPES;
export const HARNESS_WIDGETS: readonly HarnessWidget[] = AUTHORING_WIDGET_TYPES;

export function isHarnessWidget(value: string): value is HarnessWidget {
  return (HARNESS_WIDGETS as readonly string[]).includes(value);
}

export function isHarnessVariant(value: string): value is HarnessVariant {
  return (
    value === "default"
    || value === "relative-fill"
    || value === "relative-multiclass"
    || value === "standings-stress60"
    || value === "standings-multiclass"
    || value === "standings-replay"
    || value === "pedals-zero"
    || value === "pedals-full"
  );
}

export type AuthoringFixtureScenario = {
  session: AuthoringFixtureSession;
  location: AuthoringFixtureLocation;
  state: AuthoringFixtureState;
  widget: AuthoringFixtureWidget;
  system: AuthoringFixtureSystem;
  surface: AuthoringFixtureSurface;
  variant?: HarnessVariant;
  designId?: CrystalHarnessDesignId;
  replayFrame?: number;
  /** Named animation scene from the catalog; takes precedence over variant. */
  sceneId?: string;
  sceneFrame?: number;
  /** Interpolated scene state, when the player is running between keyframes. */
  sceneState?: SceneFrame;
};

function buildStandingsStressScoring(): Record<string, unknown>[] {
  return Array.from({ length: 60 }, (_, index) => ({
    id: index + 1,
    place: index + 1,
    driverName: `Driver ${index + 1}`,
    vehicleClass: "HYPERCAR",
    isPlayer: index === 4,
    inPits: index === 4,
    bestLapTime: 90 + index * 0.01,
    lastLapTime: 91 + index * 0.01,
  }));
}

type MulticlassEntry = readonly [
  driverName: string,
  driverNumber: number,
  bestLap: number,
  teamColor: string,
];

const MULTICLASS_GRID: readonly (readonly [vehicleClass: string, entries: readonly MulticlassEntry[]])[] = [
  ["LMP2", [
    ["James Allen", 22, 86.408, "#1d5ee0"],
    ["Ben Hanley", 21, 87.489, "#e8b41e"],
    ["Filipe Albuquerque", 23, 86.742, "#ed7c02"],
  ]],
  ["LMP3", [
    ["Rik Koen", 31, 92.845, "#c22456"],
    ["Quentin Antonel", 32, 92.502, "#18a37f"],
    ["Adrien Closmenil", 33, 94.024, "#3f6fd1"],
  ]],
  ["GT3", [
    ["William Friedl", 51, 98.434, "#f20205"],
    ["Rui Andrade", 55, 98.543, "#f20205"],
    ["Sarah Bovy", 85, 98.921, "#e5439b"],
    ["Gianmaria Bruni", 91, 99.192, "#25272e"],
    ["Andrew Gilbert", 60, 98.026, "#1fae54"],
    ["Michael Birch", 88, 98.086, "#25272e"],
    ["Duncan Cameron", 57, 98.057, "#fcbf1e"],
    ["Martin Berry", 46, 98.038, "#0546a5"],
    ["Matteo Cressoni", 61, 97.306, "#d7dbe4"],
    ["Conrad Laursen", 50, 98.243, "#f20205"],
  ]],
];

type ReplayOverride = {
  place?: number;
  timeBehindLeader?: number;
  lapDistanceMeters?: number;
  inPits?: boolean;
  tireCompound?: string;
  bestLapTime?: number;
  /** Drops the car from the field entirely (retirement / rejoin frames). */
  absent?: boolean;
};

export const STANDINGS_REPLAY_FRAME_COUNT = 10;

/**
 * Deterministic replay timeline for the Workshop motion preview: battle forms
 * and crystallizes (f1-f3), an overtake resolves it (f4-f5), pit stop with a
 * tire change (f6-f7), a session-best takeover (f7), a retirement (f8-f9) and
 * the re-entry back to baseline (f0).
 */
function replayOverrides(frame: number): Record<string, ReplayOverride> {
  const bovyBase = 19.35;
  const step = ((frame % STANDINGS_REPLAY_FRAME_COUNT) + STANDINGS_REPLAY_FRAME_COUNT) % STANDINGS_REPLAY_FRAME_COUNT;
  if (step === 1) {
    return { "Gianmaria Bruni": { timeBehindLeader: bovyBase + 0.6 } };
  }
  if (step === 2) {
    return { "Gianmaria Bruni": { timeBehindLeader: bovyBase + 0.35 } };
  }
  if (step === 3) {
    return { "Gianmaria Bruni": { timeBehindLeader: bovyBase + 0.15 } };
  }
  if (step === 4) {
    return {
      "Gianmaria Bruni": { place: 9, timeBehindLeader: bovyBase - 0.05 },
      "Sarah Bovy": { place: 10, timeBehindLeader: bovyBase + 0.2 },
    };
  }
  if (step === 5) {
    return {
      "Gianmaria Bruni": { place: 9, timeBehindLeader: bovyBase - 0.1 },
      "Sarah Bovy": { place: 10, timeBehindLeader: bovyBase + 1.3 },
    };
  }
  if (step === 6) {
    return {
      "Gianmaria Bruni": { place: 9, timeBehindLeader: bovyBase - 0.1 },
      "Sarah Bovy": { place: 10, timeBehindLeader: bovyBase + 1.3 },
      "Duncan Cameron": { inPits: true },
    };
  }
  if (step === 7 || step === 8) {
    return {
      "Gianmaria Bruni": { place: 9, timeBehindLeader: bovyBase - 0.1 },
      "Sarah Bovy": { place: 10, timeBehindLeader: bovyBase + 1.3 },
      "Duncan Cameron": { tireCompound: "S", timeBehindLeader: 24.5 },
      "Ben Hanley": { bestLapTime: 85.902 },
      ...(step === 8 ? { "Conrad Laursen": { absent: true } } : {}),
    };
  }
  if (step === 9) {
    // Laursen stays out one more frame so frame 0 plays his re-entry slide.
    return { "Conrad Laursen": { absent: true } };
  }
  return {};
}

function applyCarOverrides(
  overrides: Record<string, ReplayOverride>,
  field: Record<string, unknown>[] = buildStandingsMulticlassScoring(),
): Record<string, unknown>[] {
  return field
    .filter((row) => !overrides[String(row.driverName)]?.absent)
    .map((row) => {
      const patch = overrides[String(row.driverName)];
      if (!patch) {
        return row;
      }
      const rest: Record<string, unknown> = { ...patch };
      delete rest.absent;
      return { ...row, ...rest };
    });
}

export function buildStandingsReplayScoring(frame: number): Record<string, unknown>[] {
  return applyCarOverrides(replayOverrides(frame));
}

/**
 * Field for one frame of a named animation scene. Each widget's scenes run on
 * the fixture built for it: standings on the multiclass grid, relative on the
 * traffic fixture where the player has a fight either side.
 */
export function buildSceneScoring(sceneId: string, frame: number): Record<string, unknown>[] {
  const scene = getAnimationScene(sceneId);
  if (!scene) {
    return buildStandingsMulticlassScoring();
  }
  const field =
    scene.widget === "relative" ? buildRelativeMulticlassScoring() : buildStandingsMulticlassScoring();
  return applyCarOverrides(sceneFrameAt(scene, frame).cars ?? {}, field);
}

/**
 * Relative with genuine multiclass traffic: the player is a GT3 mid-pack, with a
 * same-class fight either side and quicker prototypes closing to lap them.
 */
export function buildRelativeMulticlassScoring(): Record<string, unknown>[] {
  const field: readonly [string, string, number, number][] = [
    ["James Allen", "HYPERCAR", 22, 5.5],
    ["Rik Koen", "LMP2", 31, 4.2],
    ["Rui Andrade", "GT3", 55, 1.8],
    ["Sarah Bovy", "GT3", 85, 0.4],
    ["William Friedl", "GT3", 51, 0],
    ["Gianmaria Bruni", "GT3", 91, -0.3],
    ["Andrew Gilbert", "LMP2", 60, -2.6],
    ["Michael Birch", "HYPERCAR", 88, -5.1],
  ];
  return field.map(([driverName, vehicleClass, driverNumber, gap], index) => ({
    id: `relative-multiclass-${index + 1}`,
    place: 9 + index,
    driverNumber: String(driverNumber),
    driverName,
    teamName: driverName,
    vehicleClass,
    isPlayer: gap === 0,
    inPits: false,
    lapDistanceMeters: 1_000 + gap * 100,
    timeGapToPlayer: gap,
    timeGapToLeader: 42.5 - gap,
    timeBehindLeader: 42.5 - gap,
    bestLapTime: 98.2 + index * 0.11,
    lastLapTime: 98.7 + index * 0.14,
    tireCompound: index % 3 === 0 ? "S" : "M",
  }));
}

function buildStandingsMulticlassScoring(): Record<string, unknown>[] {
  let place = 0;
  return MULTICLASS_GRID.flatMap(([vehicleClass, entries]) =>
    entries.map(([driverName, driverNumber, bestLapTime, teamBrandColor], index) => {
      place += 1;
      return {
        id: `multiclass-${place}`,
        place,
        driverNumber: String(driverNumber),
        driverName,
        vehicleClass,
        teamBrandColor,
        isPlayer: vehicleClass === "GT3" && index === 0,
        inPits: vehicleClass === "LMP3" && index === 2,
        timeBehindLeader: place === 1 ? 0 : place * 2.15,
        timeGapToLeader: place === 1 ? 0 : place * 2.15,
        bestLapTime,
        lastLapTime: bestLapTime + 0.4 + index * 0.05,
        tireCompound: index % 3 === 0 ? "S" : "M",
      };
    }),
  );
}

const CANONICAL_DRIVERS = [
  "Ferrari AF Corse", "Ferrari AF Corse (TÚ)", "Porsche Penske", "Alpine Endurance",
  "Alpine Endurance", "Cadillac Racing", "BMW M Team WRT", "BMW M Team WRT",
  "Toyota Gazoo Racing", "Toyota Gazoo Racing", "Lamborghini Iron Lynx", "Lamborghini Iron Lynx",
  "Peugeot TotalEnergies", "Peugeot TotalEnergies", "Porsche GT Team", "Porsche GT Team",
  "Aston Martin Racing", "Aston Martin Racing", "Iron Lynx", "Iron Lynx",
] as const;

const BROADCAST_DRIVERS = [
  "A. Silva", "B. Costa", "C. Martin", "D. Rojas", "E. Weber",
  "F. Morel", "G. Klein", "H. Rossi", "I. Novak", "J. Pereira",
] as const;

function buildCanonicalScoring(widget: HarnessWidget): Record<string, unknown>[] {
  const multiclass = widget === "multiclass-relative";
  const playerPlace = widget === "pedals-telemetry"
    ? 12
    : widget === "head-to-head"
      ? 12
      : widget === "multiclass-relative"
        ? 15
    : widget === "broadcast-tower" || widget === "standings"
      ? 2
      : 4;
  const broadcastColors = [
    "#cc0000", "#ff2a3b", "#2563eb", "#34d399", "#fbbf24",
    "#8b5cf6", "#22d3ee", "#f87171", "#4ade80", "#fbbf24",
  ] as const;
  return CANONICAL_DRIVERS.map((driverName, index) => {
    const displayName = widget === "broadcast-tower"
      ? BROADCAST_DRIVERS[index % BROADCAST_DRIVERS.length]
      : driverName;
    const place = index + 1;
    const isPlayer = place === playerPlace;
    const classIndex = Math.min(3, Math.floor(index / 5));
    const vehicleClass = multiclass ? ["LMP2", "LMP3", "GT4", "HYPERCAR"][classIndex] : "HYPERCAR";
    return {
      id: `canonical-${place}`,
      place,
      driverNumber: String([50, 51, 6, 36, 8, 7, 35, 46, 5, 8, 50, 63, 99, 94, 11, 92, 22, 23, 77, 78][index]),
      driverName: displayName,
      teamName: widget === "broadcast-tower" ? `T${String(index + 1).padStart(2, "0")}` : displayName,
      vehicleClass,
      isPlayer,
      inPits: false,
      ...(widget === "relative"
        ? { lapDistanceMeters: 4_000 + (playerPlace - place) * 100 }
        : {}),
      timeGapToPlayer: isPlayer ? 0 : (place - playerPlace) * 1.84,
      timeGapToLeader: place === 1 ? 0 : place * 3.45,
      timeBehindLeader: place === 1 ? 0 : place * 3.45,
      bestLapTime: 204.89 + index * 0.01,
      lastLapTime: 204.89 + index * 0.34,
      tireCompound: index % 4 === 0 ? "S" : "M",
      sectorComparisons: widget === "head-to-head" && isPlayer ? ["g", "g", "r", "r"] : undefined,
      teamBrandColor: widget === "broadcast-tower"
        ? broadcastColors[index % broadcastColors.length]
        : ["#ef4444", "#3b82f6", "#f472b6", "#fbbf24"][classIndex],
    };
  });
}

type InputTracePoint = readonly [number, number];

function interpolate(points: readonly InputTracePoint[], x: number): number {
  const rightIndex = points.findIndex(([pointX]) => pointX >= x);
  if (rightIndex <= 0) return points[Math.max(0, rightIndex)]?.[1] ?? 0;
  const [leftX, leftValue] = points[rightIndex - 1]!;
  const [rightX, rightValue] = points[rightIndex]!;
  const progress = (x - leftX) / Math.max(1, rightX - leftX);
  return leftValue + (rightValue - leftValue) * progress;
}

function buildCanonicalInputHistory(
  designId: CrystalHarnessDesignId | undefined,
  capturedAt: number,
): readonly InputTelemetrySample[] {
  const dense = designId === "input-crystal-dense";
  const capsule = designId === "input-crystal-capsule";
  const width = dense ? 400 : 500;
  const throttlePoints = dense
    ? [[0, 0], [60, 0], [100, 1], [140, 1], [180, 0], [400, 0]] as const
    : [[0, 0], [80, 0], [140, 1], [180, 1], [220, 0], [500, 0]] as const;
  const brakePeak = dense ? (40 - 15) / 36 : capsule ? (70 - 25) / 65 : (88 - 30) / 76;
  const brakePoints = dense
    ? [[0, 0], [90, 0], [110, brakePeak], [130, brakePeak], [150, 0], [400, 0]] as const
    : [[0, 0], [120, 0], [150, brakePeak], [180, brakePeak], [210, 0], [500, 0]] as const;
  const clutchPeak = capsule ? (70 - 15) / 65 : (88 - 18) / 76;
  const clutchShoulder = capsule ? (70 - 25) / 65 : (88 - 30) / 76;
  const clutchPoints = dense
    ? [[0, 0], [400, 0]] as const
    : [[0, 0], [150, clutchShoulder], [165, clutchPeak], [180, clutchShoulder], [500, 0]] as const;
  const xs = [...new Set([
    ...throttlePoints.map(([x]) => x),
    ...brakePoints.map(([x]) => x),
    ...clutchPoints.map(([x]) => x),
  ])].sort((left, right) => left - right);
  return xs.map((x) => ({
    capturedAt: capturedAt - (width - x) * (4000 / width),
    throttle: interpolate(throttlePoints, x),
    brake: interpolate(brakePoints, x),
    clutch: clutchPoints.find(([pointX]) => pointX === x)?.[1] ?? 0,
  }));
}

export function buildHarnessWidget(
  widgetType: HarnessWidget,
  systemId: DesignSystemId,
  variant: HarnessVariant = "default",
  designId?: CrystalHarnessDesignId,
  sceneId?: string,
): WidgetInstanceV3 {
  const definition = widgetTypeRegistry.get(widgetType);
  let widget = definition.createDefault(`${widgetType}-harness`);
  widget.visual = {
    ...widget.visual,
    systemId,
  };

  if (designId) {
    const design = getOfficialDesign(designId);
    if (!design) {
      throw new Error(`official Crystal design not registered: ${designId}`);
    }
    widget = applyWidgetDesign(widget, design, "1970-01-01T00:00:00.000Z");
  }
  if (widgetType === "broadcast-tower") {
    widget.content = { ...widget.content as Record<string, unknown>, rowCount: 10 };
  }
  if (widgetType === "multiclass-relative") {
    widget.content = { ...widget.content as Record<string, unknown>, rowCount: 4 };
  }
  // Scenes run on the multiclass field, so they need the same widget shape the
  // multiclass variant gets: every class visible and the best-lap column on.
  const sceneNeedsMulticlass = sceneId !== undefined && getAnimationScene(sceneId)?.widget === "standings";
  if (
    widgetType === "standings" &&
    (sceneNeedsMulticlass || variant === "standings-multiclass" || variant === "standings-replay")
  ) {
    const content = widget.content as Record<string, unknown>;
    const columns = Array.isArray(content.columns)
      ? (content.columns as Record<string, unknown>[]).map((column) =>
          column.metricId === "bestLap" ? { ...column, enabled: true } : column,
        )
      : content.columns;
    widget.content = { ...content, classScope: "all-classes", columns };
  }
  const referenceDesign = designId ? getCrystalHarnessDesign(designId) : undefined;
  widget.layout = {
    ...widget.layout,
    x: 120,
    y: 96,
    ...(referenceDesign ? { w: referenceDesign.width, h: referenceDesign.height } : {}),
    zIndex: 1,
  };

  if (widgetType === "relative" && variant === "relative-fill") {
    const content = parseRelativeContent(widget.content);
    widget.content = updateRelativeFilters(content, { rowHeightMode: "fill" });
    widget.layout = {
      ...widget.layout,
      h: Math.max(widget.layout.h, 320),
    };
  }

  return widget;
}

export function buildHarnessTelemetry(input: {
  session: MockSessionScenario;
  location: MockLocationScenario;
  state: MockDataState;
  widget: HarnessWidget;
  system?: DesignSystemId;
  variant?: HarnessVariant;
  designId?: CrystalHarnessDesignId;
  replayFrame?: number;
  sceneId?: string;
  sceneFrame?: number;
  sceneState?: SceneFrame;
}): TelemetrySnapshot {
  const variant = input.variant ?? "default";
  const base = buildMockTelemetry({
    session: input.session,
    location: input.location,
    state: input.state,
  });

  if (input.state !== "ready") {
    return base;
  }

  if (input.system === "vantare-original") {
    if (input.widget === "standings" && variant === "standings-stress60") {
      return { ...base, scoring: buildStandingsStressScoring() };
    }
    if (input.widget === "standings" && variant === "standings-multiclass") {
      return { ...base, scoring: buildStandingsMulticlassScoring() };
    }
    if (input.widget === "standings" && variant === "standings-replay") {
      return { ...base, scoring: buildStandingsReplayScoring(input.replayFrame ?? 0) };
    }
    if (input.widget === "relative" && variant === "relative-multiclass") {
      return { ...base, scoring: buildRelativeMulticlassScoring() };
    }
    if (input.widget === "pedals" && (variant === "pedals-zero" || variant === "pedals-full")) {
      const value = variant === "pedals-full" ? 1 : 0;
      return {
        ...base,
        player: { ...base.player, throttle: value, brake: value, clutch: value },
      };
    }
    return base;
  }

  const usesSectionFourPedals = input.widget === "pedals" || input.widget === "pedals-telemetry-compact";
  const readyBase: TelemetrySnapshot = {
    ...base,
    session: { ...base.session, remainingSeconds: input.widget === "standings" ? 6000 : 1161 },
    player: {
      ...base.player,
      fuelLiters: 12.4,
      lastLapSeconds: 90,
      lapNumber: input.widget === "broadcast-tower" ? 12 : 14,
      totalLaps: input.widget === "broadcast-tower" ? 25 : base.player.totalLaps,
      predictedLapSeconds: 164.659,
      deltaSeconds: input.designId === "delta-crystal-simple" ? 0 : -0.24,
      throttle: usesSectionFourPedals ? 0.85 : 1,
      brake: usesSectionFourPedals ? 0.15 : 0.06,
      clutch: 0,
      gear: input.widget === "input-telemetry" ? 3 : 6,
      speedKph: input.widget === "input-telemetry" ? 128 : 260,
      rpm: 6432,
    },
    scoring: buildCanonicalScoring(input.widget),
    derived: {
      fuelHistory: [
        { lap: 7, consumedLiters: 1 },
        { lap: 8, consumedLiters: 1 },
        { lap: 9, consumedLiters: 1 },
        { lap: 10, consumedLiters: 1 },
      ],
      inputHistory: buildCanonicalInputHistory(input.designId, base.capturedAt),
      deltaHistory: Array.from({ length: 60 }, (_, index) => ({
        capturedAt: base.capturedAt - (59 - index) * 100,
        deltaSeconds: 0.24 - index * 0.006,
      })),
    },
    auxiliary: {
      scheduleEvents: [
        { id: "spa", title: "Spa Endurance", track: "Spa-Francorchamps", startAt: "2026-07-14T18:00:00.000Z", durationMinutes: 90, classes: ["GT3"], status: "upcoming", license: "A" },
        { id: "monza", title: "Monza Sprint", track: "Monza", startAt: "2026-07-15T19:30:00.000Z", durationMinutes: 45, classes: ["GT3"], status: "upcoming", license: "A" },
        { id: "cota", title: "One Stint Sprint", track: "Circuit of the Americas", startAt: "2026-07-16T20:00:00.000Z", durationMinutes: 40, classes: ["HYPERCAR", "LMGT3"], status: "open", license: "GOLD SR" },
        { id: "lemans", title: "6 Hours of Le Mans", track: "Circuit de la Sarthe", startAt: "2026-07-17T17:00:00.000Z", durationMinutes: 360, classes: ["HYPERCAR", "LMP2", "LMGT3"], status: "team registration", license: "SPECIAL EVENT" },
      ],
    },
    environment: { ambientC: 24, trackC: 27.2, rainPercent: 0, wetnessPercent: 35, windKph: 8, windDirection: "Tailwind SE → NW", pressureHpa: 1014 },
    damage: input.widget === "car-damage-numbers"
      ? undefined
      : { body: 0, aero: 0, suspension: 0, tyres: [0, 0, 0, 0] },
  };

  if (input.widget === "standings" && variant === "standings-stress60") {
    return {
      ...readyBase,
      scoring: buildStandingsStressScoring(),
    };
  }

  if (input.widget === "standings" && variant === "standings-multiclass") {
    return {
      ...readyBase,
      scoring: buildStandingsMulticlassScoring(),
    };
  }

  if (input.widget === "relative" && variant === "relative-multiclass") {
    return { ...readyBase, scoring: buildRelativeMulticlassScoring() };
  }

  // A named scene owns the whole frame: its field, and its session clock when
  // the animation is about the clock rather than the field.
  const scene = input.sceneId ? getAnimationScene(input.sceneId) : undefined;
  if (scene && scene.widget === input.widget) {
    // Either an exact keyframe, or the interpolated state the player computed
    // for this animation frame.
    const frame = input.sceneState ?? sceneFrameAt(scene, input.sceneFrame ?? 0);
    const field =
      scene.widget === "relative" ? buildRelativeMulticlassScoring() : buildStandingsMulticlassScoring();
    return {
      ...readyBase,
      session: {
        ...readyBase.session,
        remainingSeconds: frame.remainingSeconds ?? readyBase.session.remainingSeconds,
      },
      player: { ...readyBase.player, ...(frame.player ?? {}) },
      scoring: applyCarOverrides(frame.cars ?? {}, field),
    };
  }

  if (input.widget === "standings" && variant === "standings-replay") {
    return {
      ...readyBase,
      // Under five minutes so the session slot breathes during the replay.
      session: { ...readyBase.session, remainingSeconds: 272 },
      scoring: buildStandingsReplayScoring(input.replayFrame ?? 0),
    };
  }

  if (input.widget === "pedals" && variant === "pedals-zero") {
    return {
      ...readyBase,
      player: {
        ...readyBase.player,
        throttle: 0,
        brake: 0,
        clutch: 0,
      },
    };
  }

  if (input.widget === "pedals" && variant === "pedals-full") {
    return {
      ...readyBase,
      player: {
        ...readyBase.player,
        throttle: 1,
        brake: 1,
        clutch: 1,
      },
    };
  }

  return readyBase;
}

export function buildHarnessViewModel(widget: WidgetInstanceV3, snapshot: TelemetrySnapshot): unknown {
  const definition = widgetTypeRegistry.get(widget.type);
  const content = definition.parseContent(widget.content);
  if (widget.type === "input-telemetry") {
    return buildInputTelemetryViewModel(
      snapshot,
      content as InputTelemetryContent,
      snapshot.derived?.inputHistory.map((item) => ({
        capturedAt: item.capturedAt,
        throttle: item.throttle ?? 0,
        brake: item.brake ?? 0,
        clutch: item.clutch ?? 0,
      })) ?? [],
    );
  }
  if (widget.type === "engineer-radio" && definition.buildRuntimeViewModel) {
    return definition.buildRuntimeViewModel(snapshot, content as never, {
      engineerPresentation: buildEngineerPresentationFixture(),
    });
  }
  return definition.buildViewModel(snapshot, content as never);
}

export function seedHarnessInputHistory(widget: WidgetInstanceV3, snapshot: TelemetrySnapshot): void {
  if (widget.type !== "input-telemetry") return;
  clearInputTelemetryHistory(widget.id);
  for (const item of snapshot.derived?.inputHistory ?? []) {
    recordInputTelemetrySample(widget.id, {
      ...snapshot,
      capturedAt: item.capturedAt,
      player: {
        ...snapshot.player,
        throttle: item.throttle,
        brake: item.brake,
        clutch: item.clutch,
      },
    });
  }
}

/**
 * Neutral boundary for authoring callers. `surface` belongs to the scenario so
 * callers cannot silently depend on harness defaults; it is intentionally not
 * consumed by fixture generation because renderers only receive widget+snapshot.
 */
export function buildAuthoringFixtureWidget(scenario: AuthoringFixtureScenario): WidgetInstanceV3 {
  return buildHarnessWidget(
    scenario.widget,
    scenario.system,
    scenario.variant,
    scenario.designId,
    scenario.sceneId,
  );
}

export function buildAuthoringFixtureTelemetry(scenario: AuthoringFixtureScenario): TelemetrySnapshot {
  return buildHarnessTelemetry({
    session: scenario.session,
    location: scenario.location,
    state: scenario.state,
    widget: scenario.widget,
    system: scenario.system,
    variant: scenario.variant,
    designId: scenario.designId,
    replayFrame: scenario.replayFrame,
    sceneId: scenario.sceneId,
    sceneFrame: scenario.sceneFrame,
    sceneState: scenario.sceneState,
  });
}

export function buildAuthoringFixtureViewModel(
  widget: WidgetInstanceV3,
  snapshot: TelemetrySnapshot,
): unknown {
  return buildHarnessViewModel(widget, snapshot);
}

export function resetAndSeedAuthoringInputTelemetry(
  widget: WidgetInstanceV3,
  snapshot: TelemetrySnapshot,
): void {
  seedHarnessInputHistory(widget, snapshot);
}
