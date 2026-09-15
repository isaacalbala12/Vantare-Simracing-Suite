import type { ProfileDocumentV3 } from "../../../overlay/core/profile-document";
import { applyStudioCommand, type StudioCommand } from "./studio-command";

export type StudioHistory = {
  past: ProfileDocumentV3[];
  present: ProfileDocumentV3;
  future: ProfileDocumentV3[];
  saved: ProfileDocumentV3;
  limit: number;
};

const DEFAULT_HISTORY_LIMIT = 100;

function cloneDocument(document: ProfileDocumentV3): ProfileDocumentV3 {
  return structuredClone(document);
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a == null || b == null) return a === b;

  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }

  if (typeof a === "object") {
    if (Array.isArray(b)) return false;

    let aCount = 0;
    for (const key in a) {
      if (Object.prototype.hasOwnProperty.call(a, key)) {
        const aValue = (a as Record<string, unknown>)[key];
        if (aValue === undefined) continue;
        aCount += 1;
        if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
        const bValue = (b as Record<string, unknown>)[key];
        if (bValue === undefined) return false;
        if (!deepEqual(aValue, bValue)) return false;
      }
    }

    let bCount = 0;
    for (const key in b) {
      if (Object.prototype.hasOwnProperty.call(b, key)) {
        const bValue = (b as Record<string, unknown>)[key];
        if (bValue === undefined) continue;
        bCount += 1;
      }
    }

    return aCount === bCount;
  }

  return a === b;
}

export function documentsEqual(left: ProfileDocumentV3, right: ProfileDocumentV3): boolean {
  // Go serializes map keys in a different order from the inspector. Object
  // order is not a document edit; array order (widgets/columns) still is.
  return deepEqual(left, right);
}

function trimPast(past: ProfileDocumentV3[], limit: number): ProfileDocumentV3[] {
  if (past.length <= limit) {
    return past;
  }
  return past.slice(past.length - limit);
}

export function createStudioHistory(document: ProfileDocumentV3, limit = DEFAULT_HISTORY_LIMIT): StudioHistory {
  const snapshot = cloneDocument(document);
  return {
    past: [],
    present: snapshot,
    future: [],
    saved: cloneDocument(snapshot),
    limit,
  };
}

export function commitStudioCommand(history: StudioHistory, command: StudioCommand): StudioHistory {
  const present = applyStudioCommand(history.present, command);
  if (documentsEqual(history.present, present)) {
    return history;
  }
  const previous = cloneDocument(history.present);
  return {
    ...history,
    past: trimPast([...history.past, previous], history.limit),
    present,
    future: [],
  };
}

export function undoStudioHistory(history: StudioHistory): StudioHistory {
  if (history.past.length === 0) {
    return history;
  }
  const past = [...history.past];
  const previous = past.pop();
  if (!previous) {
    return history;
  }
  return {
    ...history,
    past,
    present: cloneDocument(previous),
    future: [cloneDocument(history.present), ...history.future],
  };
}

export function redoStudioHistory(history: StudioHistory): StudioHistory {
  if (history.future.length === 0) {
    return history;
  }
  const future = [...history.future];
  const next = future.shift();
  if (!next) {
    return history;
  }
  return {
    ...history,
    past: trimPast([...history.past, cloneDocument(history.present)], history.limit),
    present: cloneDocument(next),
    future,
  };
}

export function markStudioHistorySaved(history: StudioHistory, saved: ProfileDocumentV3): StudioHistory {
  return {
    ...history,
    saved: cloneDocument(saved),
  };
}

export function discardStudioHistory(history: StudioHistory): StudioHistory {
  return {
    ...history,
    past: [],
    present: cloneDocument(history.saved),
    future: [],
  };
}

export function isStudioHistoryDirty(history: StudioHistory): boolean {
  return !documentsEqual(history.present, history.saved);
}
