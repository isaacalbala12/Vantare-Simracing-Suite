/**
 * Canonical preview fixtures for Widget Studio parity.
 *
 * All official designs of the same widget type must consume the same
 * fixture data in preview mode. This ensures identical pilot lists,
 * identical player row, identical values, and identical visible counts
 * regardless of the visual design applied.
 *
 * This module is PREVIEW-ONLY. It does not affect runtime OBS rendering.
 */

import type { ColumnConfig, ProfileConfig, WidgetConfig } from "../../lib/profile";
import type { TelemetryRefState, VehicleScoring } from "../../lib/telemetry-ref";
import type { RelativeFilterSettings } from "./relative-filters";

// ── Canonical 20-pilot telemetry fixture ──────────────────────────────────────

const CANONICAL_VEHICLES: VehicleScoring[] = [
  { id: 0, driverName: "ALPINE", driverNumber: "36", place: 1, isPlayer: false, inPits: false, timeBehindLeader: 0, totalLaps: 34, vehicleClass: "HYPERCAR", teamBrandColor: "#0055A4", tireCompound: "M", fastestLap: false, bestLapTime: 89.823, lastLapTime: 90.412, timeGapToPlayer: 4.55 },
  { id: 1, driverName: "PORSCHE PENSKE", driverNumber: "5", place: 2, isPlayer: false, inPits: false, timeBehindLeader: 1.43, totalLaps: 34, vehicleClass: "HYPERCAR", teamBrandColor: "#FFFFFF", tireCompound: "M", fastestLap: false, bestLapTime: 90.101, lastLapTime: 91.004, timeGapToPlayer: 3.12 },
  { id: 2, driverName: "FERRARI AF", driverNumber: "51", place: 3, isPlayer: false, inPits: false, timeBehindLeader: 2.152, totalLaps: 34, vehicleClass: "HYPERCAR", teamBrandColor: "#E32636", tireCompound: "S", fastestLap: true, bestLapTime: 89.455, lastLapTime: 90.332, timeGapToPlayer: 2.40 },
  { id: 3, driverName: "CADILLAC RACING", driverNumber: "2", place: 4, isPlayer: false, inPits: false, timeBehindLeader: 3.88, totalLaps: 34, vehicleClass: "HYPERCAR", teamBrandColor: "#F2A900", tireCompound: "M", fastestLap: false, bestLapTime: 91.234, lastLapTime: 92.001, timeGapToPlayer: 0.67 },
  { id: 4, driverName: "TOYOTA GAZOO", driverNumber: "8", place: 5, isPlayer: true, inPits: false, timeBehindLeader: 4.55, totalLaps: 34, vehicleClass: "HYPERCAR", teamBrandColor: "#FFFFFF", tireCompound: "M", fastestLap: false, bestLapTime: 90.876, lastLapTime: 91.221, timeGapToPlayer: 0 },
  { id: 5, driverName: "PEUGEOT", driverNumber: "94", place: 6, isPlayer: false, inPits: false, timeBehindLeader: 5.55, totalLaps: 34, vehicleClass: "HYPERCAR", teamBrandColor: "#00A3E0", tireCompound: "S", fastestLap: false, bestLapTime: 92.110, lastLapTime: 93.221, timeGapToPlayer: -1.0 },
  { id: 6, driverName: "AF CORSE", driverNumber: "83", place: 7, isPlayer: false, inPits: false, timeBehindLeader: 6.12, totalLaps: 34, vehicleClass: "HYPERCAR", teamBrandColor: "#FFD700", tireCompound: "H", fastestLap: false, bestLapTime: 92.445, lastLapTime: 93.018, timeGapToPlayer: -1.57 },
  { id: 7, driverName: "HERTZ TEAM JOTA", driverNumber: "12", place: 8, isPlayer: false, inPits: false, timeBehindLeader: 7.4, totalLaps: 34, vehicleClass: "HYPERCAR", teamBrandColor: "#C9B074", tireCompound: "M", fastestLap: false, bestLapTime: 91.789, lastLapTime: 92.554, timeGapToPlayer: -2.85 },
  { id: 8, driverName: "BMW M TEAM", driverNumber: "20", place: 9, isPlayer: false, inPits: false, timeBehindLeader: 8.9, totalLaps: 34, vehicleClass: "HYPERCAR", teamBrandColor: "#000000", tireCompound: "M", fastestLap: false, bestLapTime: 93.0, lastLapTime: 94.102, timeGapToPlayer: -4.35 },
  { id: 9, driverName: "LAMBORGHINI", driverNumber: "63", place: 10, isPlayer: false, inPits: true, pitting: true, timeBehindLeader: 9.25, totalLaps: 33, vehicleClass: "HYPERCAR", teamBrandColor: "#78B833", tireCompound: "", fastestLap: false, bestLapTime: 93.567, lastLapTime: 95.004, timeGapToPlayer: -4.7 },
  { id: 10, driverName: "ISOTTA FRASCHINI", driverNumber: "11", place: 11, isPlayer: false, inPits: false, timeBehindLeader: 11.1, totalLaps: 34, vehicleClass: "HYPERCAR", teamBrandColor: "#FF0000", tireCompound: "H", fastestLap: false, bestLapTime: 94.200, lastLapTime: 95.320, timeGapToPlayer: -6.55 },
  { id: 11, driverName: "PROTON COMP", driverNumber: "99", place: 12, isPlayer: false, inPits: false, timeBehindLeader: 12.45, totalLaps: 34, vehicleClass: "HYPERCAR", teamBrandColor: "#FFFFFF", tireCompound: "M", fastestLap: false, bestLapTime: 94.880, lastLapTime: 96.102, timeGapToPlayer: -7.9 },
  { id: 12, driverName: "UNITED AUTOSPORTS", driverNumber: "22", place: 13, isPlayer: false, inPits: false, timeBehindLeader: 15.0, totalLaps: 34, vehicleClass: "HYPERCAR", teamBrandColor: "#FFFFFF", tireCompound: "M", fastestLap: false, bestLapTime: 95.123, lastLapTime: 96.441, timeGapToPlayer: -10.45 },
  { id: 13, driverName: "INTER EUROPOL", driverNumber: "34", place: 14, isPlayer: false, inPits: false, timeBehindLeader: 18.5, totalLaps: 34, vehicleClass: "HYPERCAR", teamBrandColor: "#E63946", tireCompound: "M", fastestLap: false, bestLapTime: 96.456, lastLapTime: 97.012, timeGapToPlayer: -13.95 },
  { id: 14, driverName: "LIGIER JSP320", driverNumber: "7", place: 15, isPlayer: false, inPits: false, timeBehindLeader: 22.0, totalLaps: 33, vehicleClass: "HYPERCAR", teamBrandColor: "#f59e0b", tireCompound: "H", fastestLap: false, bestLapTime: 102.5, lastLapTime: 103.212, timeGapToPlayer: -17.45 },
  { id: 15, driverName: "GR RACING", driverNumber: "86", place: 16, isPlayer: false, inPits: false, timeBehindLeader: 25.5, totalLaps: 33, vehicleClass: "HYPERCAR", teamBrandColor: "#2ecc71", tireCompound: "S", fastestLap: false, bestLapTime: 108.2, lastLapTime: 109.334, timeGapToPlayer: -20.95 },
  { id: 16, driverName: "MAZDA", driverNumber: "55", place: 17, isPlayer: false, inPits: false, timeBehindLeader: 30.0, totalLaps: 33, vehicleClass: "HYPERCAR", teamBrandColor: "#9b2226", tireCompound: "M", fastestLap: false, bestLapTime: 109.8, lastLapTime: 110.5, timeGapToPlayer: -25.45 },
  { id: 17, driverName: "NISSAN", driverNumber: "23", place: 18, isPlayer: false, inPits: false, timeBehindLeader: 35.0, totalLaps: 33, vehicleClass: "HYPERCAR", teamBrandColor: "#C3002F", tireCompound: "H", fastestLap: false, bestLapTime: 111.2, lastLapTime: 112.0, timeGapToPlayer: -30.45 },
  { id: 18, driverName: "ASTON MARTIN", driverNumber: "98", place: 19, isPlayer: false, inPits: false, timeBehindLeader: 40.0, totalLaps: 32, vehicleClass: "HYPERCAR", teamBrandColor: "#006F62", tireCompound: "M", fastestLap: false, bestLapTime: 113.0, lastLapTime: 114.2, timeGapToPlayer: -35.45 },
  { id: 19, driverName: "MCLAREN", driverNumber: "59", place: 20, isPlayer: false, inPits: false, timeBehindLeader: 45.0, totalLaps: 32, vehicleClass: "HYPERCAR", teamBrandColor: "#FF8000", tireCompound: "S", fastestLap: false, bestLapTime: 115.5, lastLapTime: 116.8, timeGapToPlayer: -40.45 },
];

export const CANONICAL_PLAYER_ID = 4;
export const CANONICAL_PLAYER_NAME = "TOYOTA GAZOO";
export const CANONICAL_PLAYER_PLACE = 5;
export const CANONICAL_STANDINGS_COUNT = 20;
export const CANONICAL_RELATIVE_COUNT = 5;

/**
 * Returns a stable TelemetryRefState with 20 HYPERCAR vehicles.
 * All official designs of the same widget type must use this fixture
 * in Widget Studio preview mode.
 */
export function getCanonicalPreviewTelemetry(): TelemetryRefState {
  return {
    seq: 1,
    connected: true,
    playerHasVehicle: true,
    sessionType: 3,
    sessionName: "RACE",
    sessionEpoch: 1,
    sessionKey: "mock|Circuit de Barcelona|race",
    sessionState: "session",
    timeRemaining: 3600,
    speed: 245,
    gear: 4,
    rpm: 8750,
    fuel: 68,
    deltaBest: -0.150,
    trackName: "Circuit de Barcelona",
    throttle: 78,
    brake: 12,
    clutch: 0,
    vehicles: CANONICAL_VEHICLES,
  };
}

/**
 * Derives the 5 canonical relative rows from the fixture:
 * 2 cars ahead + player + 2 cars behind.
 */
export function getCanonicalRelativeRows(): VehicleScoring[] {
  const vehicles = CANONICAL_VEHICLES;
  const player = vehicles.find((v) => v.isPlayer);
  if (!player) return [];

  const ahead = vehicles
    .filter((v) => !v.isPlayer && v.timeGapToPlayer != null && v.timeGapToPlayer > 0)
    .sort((a, b) => a.timeGapToPlayer! - b.timeGapToPlayer!)
    .slice(0, 2)
    .reverse();

  const behind = vehicles
    .filter((v) => !v.isPlayer && v.timeGapToPlayer != null && v.timeGapToPlayer < 0)
    .sort((a, b) => b.timeGapToPlayer! - a.timeGapToPlayer!)
    .slice(0, 2);

  return [...ahead, player, ...behind];
}

// ── Canonical preview columns ─────────────────────────────────────────────────

/**
 * Canonical semantic columns for standings preview.
 * All official standings designs must enable these columns in preview.
 */
export const CANONICAL_STANDINGS_COLUMNS: ColumnConfig[] = [
  { id: "position", metricId: "position", enabled: true, width: 32, style: { align: "center" } },
  { id: "driverNumber", metricId: "driverNumber", enabled: true, width: 44, style: { align: "center" } },
  { id: "driverName", metricId: "driverName", enabled: true, width: 140, style: { align: "left" }, format: { mode: "full", maxChars: 16 } },
  { id: "gap", metricId: "gap", enabled: true, width: 80, style: { align: "right" } },
  { id: "bestLap", metricId: "bestLap", enabled: true, width: 80, style: { align: "right" }, format: { display: "full", decimals: 3 } },
  { id: "lastLap", metricId: "lastLap", enabled: true, width: 80, style: { align: "right" }, format: { display: "full", decimals: 3 } },
];

/**
 * Canonical semantic columns for relative preview.
 * All official relative designs must enable these columns in preview.
 */
export const CANONICAL_RELATIVE_COLUMNS: ColumnConfig[] = [
  { id: "position", metricId: "position", enabled: true, width: 36, style: { align: "center" } },
  { id: "class", metricId: "class", enabled: true, width: 6, style: { align: "center" } },
  { id: "carNumber", metricId: "carNumber", enabled: true, width: 44, style: { align: "center" } },
  { id: "driverName", metricId: "driverName", enabled: true, width: 140, style: { align: "left" }, format: { mode: "full", maxChars: 18 } },
  { id: "gap", metricId: "gap", enabled: true, width: 80, style: { align: "right" } },
  { id: "bestLap", metricId: "bestLap", enabled: true, width: 80, style: { align: "right" }, format: { display: "full", decimals: 3 } },
];

/**
 * Canonical preview filters for relative widget.
 * All official relative designs use these filters in preview.
 * Ensures exactly 5 rows: 2 ahead + player + 2 behind.
 */
export const CANONICAL_RELATIVE_FILTERS: RelativeFilterSettings = {
  rangeAhead: 2,
  rangeBehind: 2,
  classScope: "all",
  includePlayer: true,
  rowHeightMode: "fill",
};

// ── Canonical preview columns/filters by widget type ──────────────────────────

export const PREVIEW_CANONICAL_COLUMNS: Record<string, ColumnConfig[] | undefined> = {
  standings: CANONICAL_STANDINGS_COLUMNS,
  relative: CANONICAL_RELATIVE_COLUMNS,
};

export const PREVIEW_CANONICAL_FILTERS: Record<string, RelativeFilterSettings | undefined> = {
  relative: CANONICAL_RELATIVE_FILTERS,
};

export const PREVIEW_CANONICAL_MAX_ROWS: Record<string, number | undefined> = {
  standings: CANONICAL_STANDINGS_COUNT,
};

// ── Canonical static values for delta/pedals ──────────────────────────────────

export const CANONICAL_DELTA_VALUE = -0.150;
export const CANONICAL_THROTTLE_VALUE = 78;
export const CANONICAL_BRAKE_VALUE = 12;
export const CANONICAL_CLUTCH_VALUE = 0;

// ── Profile override helper ───────────────────────────────────────────────────

/**
 * Creates a modified profile where the active widget's variant uses
 * canonical columns and filters for preview parity.
 *
 * Only applies to widgets with an official design variant.
 * Does NOT modify position, x, y, w, or h.
 * Does NOT affect runtime OBS rendering.
 */
export function applyCanonicalPreviewOverrides(
  profile: ProfileConfig,
  widget: WidgetConfig,
): ProfileConfig {
  if (!widget.variantId?.startsWith("official-")) return profile;

  const widgetType = widget.type;
  const canonicalColumns = PREVIEW_CANONICAL_COLUMNS[widgetType];
  const canonicalFilters = PREVIEW_CANONICAL_FILTERS[widgetType];
  const canonicalMaxRows = PREVIEW_CANONICAL_MAX_ROWS[widgetType];

  if (!canonicalColumns && !canonicalFilters && canonicalMaxRows == null) return profile;

  const variants = (profile.variants ?? []).map((v) => {
    if (v.id !== widget.variantId) return v;
    return {
      ...v,
      // Visual identity of the official design: NEVER overwritten by preview overrides.
      templateId: v.templateId,
      themeId: v.themeId,
      columnGroups: v.columnGroups,
      slots: v.slots,
      // Only the semantic preview set is normalized for parity:
      ...(canonicalColumns ? { columns: canonicalColumns } : {}),
      ...(canonicalFilters ? { filters: canonicalFilters } : {}),
      props: {
        ...(v.props ?? {}),
        ...(canonicalMaxRows != null ? { maxRows: canonicalMaxRows } : {}),
      },
    };
  });

  return { ...profile, variants };
}

/**
 * Returns the canonical maxRows for a widget type in preview mode,
 * or undefined if the widget type doesn't use maxRows.
 */
export function getCanonicalPreviewMaxRows(widgetType: string): number | undefined {
  return PREVIEW_CANONICAL_MAX_ROWS[widgetType];
}
