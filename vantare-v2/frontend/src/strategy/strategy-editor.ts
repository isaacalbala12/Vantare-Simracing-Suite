import {
  createDefaultStrategyManualInputs,
  parseStrategyManualInputs,
  type StrategyManualInputs,
} from "./strategy-manual-input";
import {
  assertPlannable,
  defaultTyreCondition,
  parseStrategyTyre,
  STRATEGY_CORNERS,
  StrategyTyreError,
  type StrategyCompound,
  type StrategyCorner,
  type StrategyTyre,
  type StrategyTyreOrigin,
} from "./strategy-tyre";

export {
  cornerLabel,
  formatCondition,
  conditionMidpoint,
  isConditionExact,
  STRATEGY_CORNERS,
} from "./strategy-tyre";
export type {
  StrategyCompound,
  StrategyCorner,
  StrategyTyre,
  StrategyTyreCondition,
  StrategyTyreOrigin,
  StrategyTyreState,
} from "./strategy-tyre";

export const STRATEGY_EDITOR_VERSION = "strategy.editor.v1" as const;

export type StrategyStint = {
  readonly id: string;
  readonly lapCount: number;
  readonly fuelLitres: number;
  readonly pace: string;
  readonly assignments: Readonly<Record<StrategyCorner, string | null>>;
};

export type StrategyEditorDocument = {
  readonly editorVersion: typeof STRATEGY_EDITOR_VERSION;
  readonly nextStintNumber: number;
  readonly stints: readonly StrategyStint[];
  readonly tyres: readonly StrategyTyre[];
  readonly manualInputs: StrategyManualInputs;
};

export type StrategyEditorErrorCode =
  | "invalid_document"
  | "stint_not_found"
  | "tyre_not_found"
  | "corner_locked"
  | "tyre_discarded"
  | "tyre_already_assigned"
  | "last_stint";

export class StrategyEditorError extends Error {
  readonly code: StrategyEditorErrorCode;

  constructor(code: StrategyEditorErrorCode, message: string) {
    super(message);
    this.name = "StrategyEditorError";
    this.code = code;
  }
}

export function createDefaultStrategyEditorDocument(): StrategyEditorDocument {
  const tyres: StrategyTyre[] = [
    usedTyre("M-01", "medium", "front_left"),
    usedTyre("M-02", "medium", "front_right"),
    usedTyre("H-03", "hard", "rear_left"),
    usedTyre("H-04", "hard", "rear_right"),
    freeTyre("S-05", "soft"),
    freeTyre("S-06", "soft"),
    freeTyre("H-07", "hard"),
    freeTyre("M-08", "medium"),
  ];
  const baseAssignments = assignments("M-01", "M-02", "H-03", "H-04");
  return freezeDocument({
    editorVersion: STRATEGY_EDITOR_VERSION,
    nextStintNumber: 5,
    tyres,
    manualInputs: createDefaultStrategyManualInputs(),
    stints: [
      stint("stint-1", 17, 82, "2:18.4", baseAssignments),
      stint("stint-2", 22, 96, "2:19.1", baseAssignments),
      stint("stint-3", 19, 85, "2:19.4", baseAssignments),
      stint("stint-4", 20, 90, "2:18.8", baseAssignments),
    ],
  });
}

export function parseStrategyEditorDocument(value: unknown): StrategyEditorDocument {
  if (!isRecord(value) || value.editorVersion !== STRATEGY_EDITOR_VERSION) {
    throw invalidDocument("unsupported editor document");
  }
  if (!Number.isSafeInteger(value.nextStintNumber) || Number(value.nextStintNumber) < 1) {
    throw invalidDocument("next stint number must be a positive integer");
  }
  if (!Array.isArray(value.stints) || value.stints.length === 0 || !Array.isArray(value.tyres)) {
    throw invalidDocument("stints and tyres are required");
  }

  const tyres = value.tyres.map(parseStrategyTyre);
  const tyreIds = new Set<string>();
  for (const item of tyres) {
    if (tyreIds.has(item.id)) throw invalidDocument(`duplicate tyre ${item.id}`);
    tyreIds.add(item.id);
  }

  const stintIds = new Set<string>();
  const stints = value.stints.map((raw) => parseStint(raw, tyreIds));
  for (const item of stints) {
    if (stintIds.has(item.id)) throw invalidDocument(`duplicate stint ${item.id}`);
    stintIds.add(item.id);
  }

  const totalLaps = stints.reduce((sum, item) => sum + item.lapCount, 0);
  const manualInputs = parseStrategyManualInputs(
    value.manualInputs ?? createDefaultStrategyManualInputs(),
    totalLaps,
  );

  for (const item of tyres) {
    if (!item.lockedCorner) continue;
    for (const current of stints) {
      for (const corner of STRATEGY_CORNERS) {
        if (current.assignments[corner] === item.id && corner !== item.lockedCorner) {
          throw invalidDocument(`${item.id} is assigned outside its locked corner`);
        }
      }
    }
  }

  return freezeDocument({
    editorVersion: STRATEGY_EDITOR_VERSION,
    nextStintNumber: Number(value.nextStintNumber),
    stints,
    tyres,
    manualInputs,
  });
}

export function appendStint(document: StrategyEditorDocument): StrategyEditorDocument {
  return insertStint(document, document.stints.length);
}

export function insertStint(
  document: StrategyEditorDocument,
  index: number,
): StrategyEditorDocument {
  const current = parseStrategyEditorDocument(document);
  if (!Number.isSafeInteger(index) || index < 0 || index > current.stints.length) {
    throw invalidDocument("stint insertion index is outside the document");
  }
  const item = stint(
    `stint-${current.nextStintNumber}`,
    1,
    0,
    "—",
    emptyAssignments(),
  );
  const stints = [...current.stints];
  stints.splice(index, 0, item);
  return parseStrategyEditorDocument({
    ...current,
    nextStintNumber: current.nextStintNumber + 1,
    stints,
  });
}

export function duplicateStint(
  document: StrategyEditorDocument,
  stintId: string,
): StrategyEditorDocument {
  const current = parseStrategyEditorDocument(document);
  const index = findStintIndex(current, stintId);
  const copy = {
    ...current.stints[index],
    id: `stint-${current.nextStintNumber}`,
    assignments: { ...current.stints[index].assignments },
  };
  const stints = [...current.stints];
  stints.splice(index + 1, 0, copy);
  return parseStrategyEditorDocument({
    ...current,
    nextStintNumber: current.nextStintNumber + 1,
    stints,
  });
}

export function deleteStint(
  document: StrategyEditorDocument,
  stintId: string,
): StrategyEditorDocument {
  const current = parseStrategyEditorDocument(document);
  if (current.stints.length === 1) {
    throw new StrategyEditorError("last_stint", "El plan debe conservar al menos un stint.");
  }
  const index = findStintIndex(current, stintId);
  return parseStrategyEditorDocument({
    ...current,
    stints: current.stints.filter((_, candidate) => candidate !== index),
  });
}

export function moveStint(
  document: StrategyEditorDocument,
  stintId: string,
  targetIndex: number,
): StrategyEditorDocument {
  const current = parseStrategyEditorDocument(document);
  const index = findStintIndex(current, stintId);
  if (!Number.isSafeInteger(targetIndex) || targetIndex < 0 || targetIndex >= current.stints.length) {
    throw invalidDocument("stint destination is outside the document");
  }
  if (index === targetIndex) return current;
  const stints = [...current.stints];
  const [item] = stints.splice(index, 1);
  stints.splice(targetIndex, 0, item);
  return parseStrategyEditorDocument({ ...current, stints });
}

export function assignTyre(
  document: StrategyEditorDocument,
  stintId: string,
  corner: StrategyCorner,
  tyreId: string,
): StrategyEditorDocument {
  const current = parseStrategyEditorDocument(document);
  const index = findStintIndex(current, stintId);
  const tyreIndex = current.tyres.findIndex((item) => item.id === tyreId);
  if (tyreIndex < 0) {
    throw new StrategyEditorError("tyre_not_found", `No existe el neumático ${tyreId}.`);
  }
  if (!STRATEGY_CORNERS.includes(corner)) throw invalidDocument("unknown corner");
  const selected = current.tyres[tyreIndex];
  const target = current.stints[index];
  // The domain decides legality. Planning is not mounting, so assigning a
  // fresh tyre never locks its corner: only recorded use does that.
  try {
    assertPlannable(selected, corner);
  } catch (error) {
    if (error instanceof StrategyTyreError) {
      const code = error.code === "tyre_discarded" ? "tyre_discarded" : "corner_locked";
      throw new StrategyEditorError(code, error.message);
    }
    throw error;
  }
  for (const candidate of STRATEGY_CORNERS) {
    if (candidate !== corner && target.assignments[candidate] === tyreId) {
      throw new StrategyEditorError(
        "tyre_already_assigned",
        `${tyreId} ya está asignado en este stint.`,
      );
    }
  }
  if (target.assignments[corner] === tyreId) return current;

  const stints = [...current.stints];
  stints[index] = {
    ...target,
    assignments: { ...target.assignments, [corner]: tyreId },
  };
  return parseStrategyEditorDocument({ ...current, stints });
}

export function clearTyreAssignment(
  document: StrategyEditorDocument,
  stintId: string,
  corner: StrategyCorner,
): StrategyEditorDocument {
  const current = parseStrategyEditorDocument(document);
  const index = findStintIndex(current, stintId);
  if (current.stints[index].assignments[corner] === null) return current;
  const stints = [...current.stints];
  stints[index] = {
    ...current.stints[index],
    assignments: { ...current.stints[index].assignments, [corner]: null },
  };
  return parseStrategyEditorDocument({ ...current, stints });
}

export function stintLapRange(
  document: StrategyEditorDocument,
  stintIndex: number,
): { start: number; end: number } {
  const current = parseStrategyEditorDocument(document);
  if (stintIndex < 0 || stintIndex >= current.stints.length) {
    throw invalidDocument("stint index is outside the document");
  }
  const start = current.stints
    .slice(0, stintIndex)
    .reduce((total, item) => total + item.lapCount, 1);
  return { start, end: start + current.stints[stintIndex].lapCount - 1 };
}

export function tyreUseCount(document: StrategyEditorDocument, tyreId: string): number {
  const current = parseStrategyEditorDocument(document);
  return current.stints.reduce(
    (count, item) => count + STRATEGY_CORNERS.filter((corner) => item.assignments[corner] === tyreId).length,
    0,
  );
}

function parseStint(value: unknown, tyreIds: ReadonlySet<string>): StrategyStint {
  if (!isRecord(value) || !validID(value.id)) throw invalidDocument("invalid stint id");
  if (!Number.isSafeInteger(value.lapCount) || Number(value.lapCount) < 1) {
    throw invalidDocument(`invalid lap count for ${String(value.id)}`);
  }
  if (typeof value.fuelLitres !== "number" || !Number.isFinite(value.fuelLitres) || value.fuelLitres < 0) {
    throw invalidDocument(`invalid fuel for ${String(value.id)}`);
  }
  if (typeof value.pace !== "string" || value.pace.length > 32) {
    throw invalidDocument(`invalid pace for ${String(value.id)}`);
  }
  if (!isRecord(value.assignments)) throw invalidDocument(`missing assignments for ${String(value.id)}`);
  const output = emptyAssignments();
  const used = new Set<string>();
  for (const corner of STRATEGY_CORNERS) {
    const id = value.assignments[corner];
    if (id !== null && (typeof id !== "string" || !tyreIds.has(id))) {
      throw invalidDocument(`unknown tyre in ${String(value.id)} ${corner}`);
    }
    if (typeof id === "string" && used.has(id)) {
      throw invalidDocument(`the same tyre occupies two corners in ${String(value.id)}`);
    }
    if (typeof id === "string") used.add(id);
    output[corner] = id as string | null;
  }
  return {
    id: value.id,
    lapCount: Number(value.lapCount),
    fuelLitres: value.fuelLitres,
    pace: value.pace,
    assignments: output,
  };
}

function findStintIndex(document: StrategyEditorDocument, stintId: string): number {
  const index = document.stints.findIndex((item) => item.id === stintId);
  if (index < 0) throw new StrategyEditorError("stint_not_found", `No existe el stint ${stintId}.`);
  return index;
}

function assignments(frontLeft: string, frontRight: string, rearLeft: string, rearRight: string) {
  return {
    front_left: frontLeft,
    front_right: frontRight,
    rear_left: rearLeft,
    rear_right: rearRight,
  } satisfies Record<StrategyCorner, string | null>;
}

function emptyAssignments(): Record<StrategyCorner, string | null> {
  return { front_left: null, front_right: null, rear_left: null, rear_right: null };
}

function freeTyre(id: string, compound: StrategyCompound): StrategyTyre {
  return tyreFrom(id, compound, "event_allocation", "free", 0);
}

/** A tyre that has already run, so its corner is permanently fixed. */
function usedTyre(id: string, compound: StrategyCompound, lockedCorner: StrategyCorner): StrategyTyre {
  return { ...tyreFrom(id, compound, "qualifying", "used", 1), lockedCorner };
}

function tyreFrom(
  id: string,
  compound: StrategyCompound,
  origin: StrategyTyreOrigin,
  state: StrategyTyre["state"],
  stints: number,
): StrategyTyre {
  return { id, compound, origin, condition: defaultTyreCondition(origin), state, stints };
}

function stint(
  id: string,
  lapCount: number,
  fuelLitres: number,
  pace: string,
  assignmentsValue: Record<StrategyCorner, string | null>,
): StrategyStint {
  return { id, lapCount, fuelLitres, pace, assignments: assignmentsValue };
}

function freezeDocument(document: StrategyEditorDocument): StrategyEditorDocument {
  const clone = structuredClone(document);
  deepFreeze(clone);
  return clone;
}

function deepFreeze(value: unknown): void {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
}

function invalidDocument(message: string) {
  return new StrategyEditorError("invalid_document", message);
}

function validID(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
