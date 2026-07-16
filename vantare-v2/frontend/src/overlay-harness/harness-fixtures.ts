import { buildMockTelemetry } from "../overlay/core/mock-scenarios";
import type {
  MockDataState,
  MockLocationScenario,
  MockSessionScenario,
} from "../overlay/core/mock-scenarios";
import type { WidgetType, DesignSystemId, WidgetInstanceV3 } from "../overlay/core/profile-document";
import type { TelemetrySnapshot } from "../overlay/core/telemetry-snapshot";
import { widgetTypeRegistry } from "../overlay/core/widget-registry";
import { applyWidgetDesign } from "../overlay/core/widget-design";
import { getOfficialDesign } from "../overlay/design-systems/official-designs";
import type { InputTelemetryContent } from "../overlay/widget-types/input-telemetry/input-telemetry-definition";
import {
  recordInputTelemetrySample,
  resetInputTelemetryHistory,
  type InputTelemetrySample,
} from "../overlay/widget-types/input-telemetry/input-telemetry-accumulator";
import { buildInputTelemetryViewModel } from "../overlay/widget-types/input-telemetry/input-telemetry-view-model";
import { parseRelativeContent, updateRelativeFilters } from "../overlay/widget-types/relative/relative-content";
import crystalReferenceManifest from "../../testdata/crystal-reference/manifest.json";

export type HarnessWidget = WidgetType;
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

export function getCrystalHarnessDesign(designId: string): CrystalHarnessDesign | undefined {
  return CRYSTAL_HARNESS_DESIGNS.find((design) => design.designId === designId);
}
export type HarnessVariant =
  | "default"
  | "relative-fill"
  | "standings-stress60"
  | "pedals-zero"
  | "pedals-full";

export const HARNESS_WIDGETS: readonly HarnessWidget[] = [
  ...new Set(CRYSTAL_HARNESS_DESIGNS.map((design) => design.widgetType)),
];

export function isHarnessWidget(value: string): value is HarnessWidget {
  return (HARNESS_WIDGETS as readonly string[]).includes(value);
}

export function isHarnessVariant(value: string): value is HarnessVariant {
  return (
    value === "default"
    || value === "relative-fill"
    || value === "standings-stress60"
    || value === "pedals-zero"
    || value === "pedals-full"
  );
}

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
      timeGapToPlayer: isPlayer ? 0 : (place - playerPlace) * 1.84,
      timeGapToLeader: place === 1 ? 0 : place * 3.45,
      timeBehindLeader: place === 1 ? 0 : place * 3.45,
      bestLapTime: 204.89 + index * 0.01,
      lastLapTime: 204.89 + index * 0.34,
      tireCompound: index % 4 === 0 ? "S" : "M",
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
  variant?: HarnessVariant;
  designId?: CrystalHarnessDesignId;
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
        { id: "monza", title: "Monza Sprint", track: "Monza", startAt: "2026-07-15T19:30:00.000Z", durationMinutes: 45, classes: ["GT3", "GT4"], status: "upcoming", license: "A" },
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
  return definition.buildViewModel(snapshot, content as never);
}

export function seedHarnessInputHistory(widget: WidgetInstanceV3, snapshot: TelemetrySnapshot): void {
  if (widget.type !== "input-telemetry") return;
  resetInputTelemetryHistory();
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
