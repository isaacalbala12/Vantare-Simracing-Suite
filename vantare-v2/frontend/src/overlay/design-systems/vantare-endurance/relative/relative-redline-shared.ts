import type { RelativeRowViewModel } from "../../../widget-types/relative/relative-view-model";

/** Gap beyond which a rival is no longer treated as "near" by the proximity visuals. */
export const RELATIVE_PROXIMITY_HORIZON_SECONDS = 5;
/** Gap under which a rival counts as an imminent threat (approach bar, seam emphasis). */
export const RELATIVE_IMMINENT_SECONDS = 1;

const CLASS_RANK: Record<string, number> = {
  HYPERCAR: 0,
  LMH: 0,
  LMDH: 0,
  GTP: 0,
  LMP1: 1,
  LMP2: 2,
  LMP3: 3,
  GTE: 4,
  GT3: 5,
  LMGT3: 5,
  GT4: 6,
};

const CLASS_SHORT: Record<string, string> = {
  HYPERCAR: "HY",
  LMGT3: "GT3",
};

/** Compact chip label — HYPERCAR would blow the column otherwise. */
export function classShortLabel(vehicleClass: string): string {
  const cls = vehicleClass.trim().toUpperCase();
  return CLASS_SHORT[cls] ?? cls;
}

/** Lower rank = faster category. Unknown classes sort last so they never claim priority. */
export function classRank(vehicleClass: string): number {
  return CLASS_RANK[vehicleClass.trim().toUpperCase()] ?? 99;
}

/** True when `other` races in a quicker category than the player and is therefore lapping traffic. */
export function isFasterClass(other: string, playerClass: string): boolean {
  if (!other || !playerClass) {
    return false;
  }
  return classRank(other) < classRank(playerClass);
}

/**
 * 0 → at the horizon or beyond, 1 → side by side. Drives every proximity fill so
 * the bars all share one scale regardless of which side of the player they sit on.
 */
export function proximity(
  gapSeconds: number | null,
  horizonSeconds: number = RELATIVE_PROXIMITY_HORIZON_SECONDS,
): number {
  if (gapSeconds === null || !Number.isFinite(gapSeconds) || horizonSeconds <= 0) {
    return 0;
  }
  const distance = Math.abs(gapSeconds);
  return Math.max(0, Math.min(1, 1 - distance / horizonSeconds));
}

export function isImminent(row: RelativeRowViewModel): boolean {
  return (
    !row.isPlayer &&
    row.gapSeconds !== null &&
    Math.abs(row.gapSeconds) <= RELATIVE_IMMINENT_SECONDS
  );
}

/**
 * Class palette for the Redline relative. Taxonomy is muted on purpose: the
 * saturated slots are spoken for by the semantic layer (carmine = player and
 * events, green/red = gain and loss, purple = fastest lap, blue = lapping
 * traffic), so class identity must never compete with a race signal.
 */
export const RELATIVE_REDLINE_CLASS_COLORS = {
  classHypercarColor: "#e0e4ec",
  classLmp2Color: "#8fa8c4",
  classLmp3Color: "#c2926a",
  classGt3Color: "#9fb89a",
  classUnknownColor: "#6b7280",
} as const;

/** "F. Surname" — same treatment the Redline standings gives driver names. */
export function initialSurname(driverName: string): string {
  const words = driverName
    .replace(/\(.*?\)/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (words.length < 2) {
    return driverName;
  }
  return `${words[0]![0]}. ${words.slice(1).join(" ")}`;
}

/** Signed one-decimal gap: "+1.8" ahead, "−0.3" behind (true minus sign). */
export function signedGap(row: RelativeRowViewModel): string {
  if (row.gapSeconds === null || !Number.isFinite(row.gapSeconds)) {
    return row.gapText;
  }
  const value = Math.abs(row.gapSeconds).toFixed(1);
  return row.gapSeconds > 0 ? `+${value}` : row.gapSeconds < 0 ? `−${value}` : value;
}

/** The nearest car in a quicker class closing from behind — the one about to lap the player. */
export function findLappingThreat(
  rows: readonly RelativeRowViewModel[],
  playerClass: string,
): RelativeRowViewModel | null {
  let closest: RelativeRowViewModel | null = null;
  for (const row of rows) {
    if (row.isPlayer || row.gapSeconds === null || row.gapSeconds >= 0) {
      continue;
    }
    if (!isFasterClass(row.vehicleClass, playerClass)) {
      continue;
    }
    if (closest === null || row.gapSeconds > closest.gapSeconds!) {
      closest = row;
    }
  }
  return closest;
}
