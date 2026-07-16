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

function buildCanonicalScoring(widget: HarnessWidget): Record<string, unknown>[] {
  const multiclass = widget === "multiclass-relative";
  const playerPlace = widget === "pedals-telemetry" ? 12 : 4;
  return CANONICAL_DRIVERS.map((driverName, index) => {
    const place = index + 1;
    const isPlayer = place === playerPlace;
    const classIndex = Math.min(3, Math.floor(index / 5));
    const vehicleClass = multiclass ? ["LMP2", "LMP3", "GT4", "HYPERCAR"][classIndex] : "HYPERCAR";
    return {
      id: `canonical-${place}`,
      place,
      driverNumber: String([50, 51, 6, 36, 8, 7, 35, 46, 5, 8, 50, 63, 99, 94, 11, 92, 22, 23, 77, 78][index]),
      driverName,
      teamName: driverName,
      vehicleClass,
      isPlayer,
      inPits: false,
      timeGapToPlayer: isPlayer ? 0 : (place - playerPlace) * 1.84,
      timeGapToLeader: place === 1 ? 0 : place * 3.45,
      bestLapTime: 204.89 + index * 0.01,
      lastLapTime: 204.89 + index * 0.34,
      tireCompound: index % 4 === 0 ? "S" : "M",
      teamBrandColor: ["#ef4444", "#3b82f6", "#f472b6", "#fbbf24"][classIndex],
    };
  });
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
    session: { ...base.session, remainingSeconds: 1161 },
    player: {
      ...base.player,
      fuelLiters: 12.4,
      lastLapSeconds: 90,
      lapNumber: 14,
      predictedLapSeconds: 164.659,
      deltaSeconds: input.designId === "delta-crystal-simple" ? 0 : -0.24,
      throttle: usesSectionFourPedals ? 0.85 : 1,
      brake: usesSectionFourPedals ? 0.15 : 0.06,
      clutch: 0,
      gear: 6,
      speedKph: 260,
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
      inputHistory: Array.from({ length: 48 }, (_, index) => ({
        capturedAt: base.capturedAt - (47 - index) * 50,
        throttle: Math.min(1, index / 32),
        brake: index > 34 ? (index - 34) / 14 : 0,
        clutch: 0,
      })),
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
    damage: { body: 0, aero: 0, suspension: 0, tyres: [0, 0, 0, 0] },
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
  return definition.buildViewModel(snapshot, content as never);
}
