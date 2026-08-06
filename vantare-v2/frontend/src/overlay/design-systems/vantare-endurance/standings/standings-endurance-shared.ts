import type { StandingsRowViewModel } from "../../../widget-types/standings/standings-view-model";

export type ClassGroup = {
  vehicleClass: string;
  rows: StandingsRowViewModel[];
};

const CLASS_HIERARCHY = ["HYPERCAR", "LMP2", "LMP3", "GT3"] as const;

export function classHierarchyIndex(vehicleClass: string): number {
  const index = (CLASS_HIERARCHY as readonly string[]).indexOf(vehicleClass.toUpperCase());
  return index === -1 ? CLASS_HIERARCHY.length : index;
}

/** Player's class always renders as the bottom panel; the rest stack above it in hierarchy order. */
export function groupRowsByClass(rows: readonly StandingsRowViewModel[]): ClassGroup[] {
  const groups = new Map<string, ClassGroup>();
  for (const row of rows) {
    const key = row.vehicleClass || "—";
    const group = groups.get(key);
    if (group) {
      group.rows.push(row);
    } else {
      groups.set(key, { vehicleClass: key, rows: [row] });
    }
  }
  const ordered = [...groups.values()];
  const isPlayerGroup = (group: ClassGroup) => group.rows.some((row) => row.isPlayer);
  return ordered.sort((left, right) => {
    const leftPlayer = isPlayerGroup(left);
    const rightPlayer = isPlayerGroup(right);
    if (leftPlayer !== rightPlayer) {
      return leftPlayer ? 1 : -1;
    }
    return classHierarchyIndex(left.vehicleClass) - classHierarchyIndex(right.vehicleClass);
  });
}

/**
 * Caps a class block at `limit` rows while keeping the player visible: when the
 * player sits outside the cut, the last visible slot shows the player instead.
 */
export function capGroupRows(
  rows: readonly StandingsRowViewModel[],
  limit: number,
): { row: StandingsRowViewModel; classPosition: number }[] {
  const indexed = rows.map((row, index) => ({ row, classPosition: index + 1 }));
  if (indexed.length <= limit) {
    return indexed;
  }
  const visible = indexed.slice(0, limit);
  const player = indexed.find((entry) => entry.row.isPlayer);
  if (player && player.classPosition > limit) {
    visible[limit - 1] = player;
  }
  return visible;
}

export function driverCode(driverName: string): string {
  const words = driverName
    .replace(/\(.*?\)/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const lastWord = words[words.length - 1] ?? "";
  return (lastWord.length >= 3 ? lastWord : driverName.replace(/\s+/g, "")).slice(0, 3).toUpperCase();
}

export function tireLetter(tireCompound: string): string {
  return (tireCompound.trim()[0] ?? "").toUpperCase();
}

export function lapTextToSeconds(lapText: string): number | null {
  const match = /^(?:(\d+):)?(\d{1,2}\.\d{1,3})$/.exec(lapText.trim());
  if (!match) {
    return null;
  }
  const minutes = match[1] ? Number(match[1]) : 0;
  return minutes * 60 + Number(match[2]);
}

/** Best lap of the whole field, for session-best (purple) highlighting. */
export function findSessionBestLapSeconds(rows: readonly StandingsRowViewModel[]): number | null {
  let best: number | null = null;
  for (const row of rows) {
    const seconds = lapTextToSeconds(row.bestLapText);
    if (seconds !== null && (best === null || seconds < best)) {
      best = seconds;
    }
  }
  return best;
}
