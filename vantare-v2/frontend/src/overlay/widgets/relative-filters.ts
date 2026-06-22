import type { VehicleScoring } from "../../lib/telemetry-ref";

export type { VehicleScoring };

export type RelativeClassScope = "all" | "sameClass";
export type RelativeRowHeightMode = "fill" | "compact";

export const RELATIVE_RANGE_MIN = 0;
export const RELATIVE_RANGE_MAX = 4;

export type RelativeFilterSettings = {
  rangeAhead: number;
  rangeBehind: number;
  classScope: RelativeClassScope;
  includePlayer: boolean;
  rowHeightMode: RelativeRowHeightMode;
};

export const DEFAULT_RELATIVE_FILTERS: RelativeFilterSettings = {
  rangeAhead: 3,
  rangeBehind: 3,
  classScope: "all",
  includePlayer: true,
  rowHeightMode: "fill",
};

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function readClassScope(value: unknown): RelativeClassScope | undefined {
  return value === "sameClass" || value === "all" ? value : undefined;
}

function readRowHeightMode(value: unknown): RelativeRowHeightMode | undefined {
  return value === "compact" || value === "fill" ? value : undefined;
}

function clampRange(value: unknown, fallback: number): number {
  const n = readNumber(value);
  if (n == null) return fallback;
  return Math.max(RELATIVE_RANGE_MIN, Math.min(RELATIVE_RANGE_MAX, Math.round(n)));
}

export function getRelativeFilters(
  variantFilters?: Record<string, unknown>,
  legacyProps?: Record<string, unknown>,
): RelativeFilterSettings {
  return {
    rangeAhead: clampRange(
      variantFilters?.rangeAhead ?? legacyProps?.rangeAhead,
      DEFAULT_RELATIVE_FILTERS.rangeAhead,
    ),
    rangeBehind: clampRange(
      variantFilters?.rangeBehind ?? legacyProps?.rangeBehind,
      DEFAULT_RELATIVE_FILTERS.rangeBehind,
    ),
    classScope: readClassScope(variantFilters?.classScope) ?? DEFAULT_RELATIVE_FILTERS.classScope,
    includePlayer: readBoolean(variantFilters?.includePlayer) ?? DEFAULT_RELATIVE_FILTERS.includePlayer,
    rowHeightMode: readRowHeightMode(variantFilters?.rowHeightMode) ?? DEFAULT_RELATIVE_FILTERS.rowHeightMode,
  };
}

export function selectRelativeRows(
  vehicles: Partial<VehicleScoring>[],
  filters: RelativeFilterSettings,
): Partial<VehicleScoring>[] {
  const player = vehicles.find((vehicle) => vehicle.isPlayer);
  if (!player) return [];

  const playerClass = (player.vehicleClass ?? "").toUpperCase();
  const candidates = vehicles.filter((vehicle) => {
    if (vehicle.isPlayer) return false;
    if (vehicle.timeGapToPlayer == null || !Number.isFinite(vehicle.timeGapToPlayer)) return false;
    if (filters.classScope === "sameClass") {
      return (vehicle.vehicleClass ?? "").toUpperCase() === playerClass;
    }
    return true;
  });

  const withGap = candidates.map((vehicle) => ({ vehicle, gap: vehicle.timeGapToPlayer! }));
  const ahead = withGap
    .filter((item) => item.gap > 0)
    .sort((a, b) => a.gap - b.gap)
    .slice(0, filters.rangeAhead)
    .map((item) => item.vehicle)
    .reverse();
  const behind = withGap
    .filter((item) => item.gap < 0)
    .sort((a, b) => b.gap - a.gap)
    .slice(0, filters.rangeBehind)
    .map((item) => item.vehicle);

  return filters.includePlayer ? [...ahead, player, ...behind] : [...ahead, ...behind];
}
