import { readScoringBoolean, readScoringNumber, readScoringString } from "../shared/scoring-readers";
import type { RelativeClassScope, RelativeContent } from "./relative-content";
import type { RelativeScoringRow } from "./relative-formatting";

function readGap(row: RelativeScoringRow): number | undefined {
  return readScoringNumber(row, "timeGapToPlayer");
}

export function selectRelativeRows(
  rows: readonly RelativeScoringRow[],
  filters: Pick<
    RelativeContent,
    "rangeAhead" | "rangeBehind" | "classScope" | "includePlayer"
  >,
): RelativeScoringRow[] {
  const player = rows.find((row) => readScoringBoolean(row, "isPlayer"));
  if (!player) {
    return [];
  }

  const playerClass = (readScoringString(player, "vehicleClass") ?? "").toUpperCase();
  const candidates = rows.filter((row) => {
    if (readScoringBoolean(row, "isPlayer")) {
      return false;
    }
    const gap = readGap(row);
    if (gap == null) {
      return false;
    }
    if (filters.classScope === "sameClass") {
      return (readScoringString(row, "vehicleClass") ?? "").toUpperCase() === playerClass;
    }
    return true;
  });

  const withGap = candidates.map((row) => ({ row, gap: readGap(row)! }));
  const ahead = withGap
    .filter((item) => item.gap > 0)
    .sort((left, right) => left.gap - right.gap)
    .slice(0, filters.rangeAhead)
    .map((item) => item.row)
    .reverse();
  const behind = withGap
    .filter((item) => item.gap < 0)
    .sort((left, right) => right.gap - left.gap)
    .slice(0, filters.rangeBehind)
    .map((item) => item.row);

  return filters.includePlayer ? [...ahead, player, ...behind] : [...ahead, ...behind];
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