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

function documentsEqual(left: ProfileDocumentV3, right: ProfileDocumentV3): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
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
  const previous = cloneDocument(history.present);
  const present = applyStudioCommand(history.present, command);
  if (documentsEqual(previous, present)) {
    return history;
  }
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