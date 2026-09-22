import { resolveFunctionalClassAccent, type FunctionalClassAccent } from "./functional-class-accent";
import type { StandingsClassificationMode } from "./standings-content";
import type { StandingsRowViewModel } from "./standings-view-model";

/** Altura de una banda de clase dentro de la tabla de Eficiencia V1. */
export const FUNCTIONAL_STANDINGS_CLASS_BAND_HEIGHT = 28;


export type FunctionalStandingsEntry =
  | {
      kind: "class";
      key: string;
      classId: string;
      label: string;
      accent: FunctionalClassAccent;
    }
  | {
      kind: "row";
      key: string;
      row: StandingsRowViewModel;
      displayPosition: number;
    };

function normalizedClassId(value: string): string {
  return value.trim().toUpperCase();
}


/**
 * Returns the same pilot rows in normal mode and class blocks in multiclass.
 * The producer order is retained inside each class; class order follows the
 * first occurrence in the received frame so the renderer never sorts by a
 * presentation-only heuristic.
 */
export function buildFunctionalStandingsEntries(
  rows: readonly StandingsRowViewModel[],
  classificationMode: StandingsClassificationMode | undefined,
): FunctionalStandingsEntry[] {
  if (classificationMode !== "multiclass") {
    return rows.map((row) => ({
      kind: "row" as const,
      key: `row:${row.id}`,
      row,
      displayPosition: row.position,
    }));
  }

  const groups = new Map<string, StandingsRowViewModel[]>();
  const unclassified: StandingsRowViewModel[] = [];
  for (const row of rows) {
    const classId = normalizedClassId(row.vehicleClass);
    if (classId === "") {
      unclassified.push(row);
      continue;
    }
    const group = groups.get(classId);
    if (group) {
      group.push(row);
    } else {
      groups.set(classId, [row]);
    }
  }

  const entries: FunctionalStandingsEntry[] = [];
  for (const [classId, classRows] of groups) {
    entries.push({
      kind: "class",
      key: `class:${classId}`,
      classId,
      label: classId,
      accent: resolveFunctionalClassAccent(classId),
    });
    for (const row of classRows) {
      entries.push({
        kind: "row",
        key: `row:${row.id}`,
        row,
        displayPosition: row.classPosition ?? row.position,
      });
    }
  }

  // Unknown-class rows remain visible, but do not receive a fabricated class
  // band or a reset position.
  for (const row of unclassified) {
    entries.push({
      kind: "row",
      key: `row:${row.id}`,
      row,
      displayPosition: row.position,
    });
  }
  return entries;
}

export function countFunctionalStandingsClassBands(
  rows: readonly StandingsRowViewModel[],
  classificationMode: StandingsClassificationMode | undefined,
): number {
  if (classificationMode !== "multiclass") return 0;
  const classes = new Set(rows.map((row) => normalizedClassId(row.vehicleClass)).filter(Boolean));
  return classes.size;
}

/**
 * Fits pilot rows into a finite table body while charging each distinct class
 * one band. `rowCount` remains a pilot-row limit; this helper only handles
 * the physical space available in the current widget layout.
 */
export function takeFunctionalStandingsRows(
  rows: readonly StandingsRowViewModel[],
  classificationMode: StandingsClassificationMode | undefined,
  availableHeight: number,
  rowHeight = 30,
): StandingsRowViewModel[] {
  if (!Number.isFinite(availableHeight)) return [...rows];

  const seenClasses = new Set<string>();
  let usedHeight = 0;
  let count = 0;
  for (const row of rows) {
    const classId = normalizedClassId(row.vehicleClass);
    const bandHeight = classificationMode === "multiclass" && classId !== "" && !seenClasses.has(classId)
      ? FUNCTIONAL_STANDINGS_CLASS_BAND_HEIGHT
      : 0;
    if (usedHeight + bandHeight + rowHeight > Math.max(0, availableHeight)) break;
    usedHeight += bandHeight + rowHeight;
    if (classId !== "") seenClasses.add(classId);
    count += 1;
  }
  return rows.slice(0, count);
}
