import { readScoringBoolean, readScoringNumber, readScoringString } from "../shared/scoring-readers";
import type { RelativeClassScope, RelativeContent } from "./relative-content";
import type { RelativeScoringRow } from "./relative-formatting";

export type RelativeSide = "ahead" | "player" | "behind";

export type SelectedRelativeRow = {
  row: RelativeScoringRow;
  side: RelativeSide;
};

function readLapDistance(row: RelativeScoringRow): number | undefined {
  return readScoringNumber(row, "lapDistanceMeters");
}

function stableRowIdentity(row: RelativeScoringRow): string {
  const stringId = readScoringString(row, "id");
  if (stringId != null) {
    return stringId;
  }
  const numericId = readScoringNumber(row, "id");
  if (numericId != null) {
    return String(numericId);
  }
  return readScoringString(row, "driverNumber") ?? readScoringString(row, "driverName") ?? "";
}

export function selectRelativeRows(
  rows: readonly RelativeScoringRow[],
  filters: Pick<
    RelativeContent,
    "rangeAhead" | "rangeBehind" | "classScope" | "includePlayer"
  >,
): SelectedRelativeRow[] {
  const player = rows.find((row) => readScoringBoolean(row, "isPlayer"));
  if (!player) {
    return [];
  }
  if (readLapDistance(player) == null) {
    return filters.includePlayer ? [{ row: player, side: "player" }] : [];
  }

  const playerClass = (readScoringString(player, "vehicleClass") ?? "").toUpperCase();
  const candidates = rows.filter((row) => {
    if (readScoringBoolean(row, "isPlayer")) {
      return false;
    }
    if (readLapDistance(row) == null) {
      return false;
    }
    if (filters.classScope === "sameClass") {
      return (readScoringString(row, "vehicleClass") ?? "").toUpperCase() === playerClass;
    }
    return true;
  });

  const ordered = [...candidates, player].sort((left, right) => {
    const distance = readLapDistance(left)! - readLapDistance(right)!;
    return distance !== 0
      ? distance
      : stableRowIdentity(left).localeCompare(stableRowIdentity(right));
  });
  const playerIndex = ordered.indexOf(player);
  const selected = new Set<RelativeScoringRow>([player]);
  const aheadNearToFar: RelativeScoringRow[] = [];
  const behind: RelativeScoringRow[] = [];
  for (
    let offset = 1;
    offset < ordered.length &&
    (aheadNearToFar.length < filters.rangeAhead || behind.length < filters.rangeBehind);
    offset += 1
  ) {
    const ahead = ordered[(playerIndex + offset) % ordered.length];
    if (ahead && aheadNearToFar.length < filters.rangeAhead && !selected.has(ahead)) {
      selected.add(ahead);
      aheadNearToFar.push(ahead);
    }

    const behindCandidate = ordered[(playerIndex - offset + ordered.length) % ordered.length];
    if (behindCandidate && behind.length < filters.rangeBehind && !selected.has(behindCandidate)) {
      selected.add(behindCandidate);
      behind.push(behindCandidate);
    }
  }

  const ahead = aheadNearToFar.reverse();

  const selectedAhead = ahead.map((row) => ({ row, side: "ahead" as const }));
  const selectedBehind = behind.map((row) => ({ row, side: "behind" as const }));
  return filters.includePlayer
    ? [...selectedAhead, { row: player, side: "player" }, ...selectedBehind]
    : [...selectedAhead, ...selectedBehind];
}

export function resolveRelativeTone(gap: number | undefined, isPlayer: boolean): "ahead" | "behind" | "player" | "neutral" {
  if (isPlayer) {
    return "player";
  }
  if (gap == null || gap === 0) {
    return "neutral";
  }
  return gap > 0 ? "ahead" : "behind";
}

export type RelativeClassScopeExport = RelativeClassScope;
