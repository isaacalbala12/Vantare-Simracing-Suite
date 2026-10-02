import type {
  ProfileDocumentV3,
} from "../../../overlay/core/profile-document";
import { isStudioHistoryDirty, type StudioHistory } from "./studio-history";

type DirtyCache = {
  present: ProfileDocumentV3;
  saved: ProfileDocumentV3;
  value: boolean;
};

// This is deliberately a one-entry cache. It reuses the dirty comparison
// across consumers without retaining every document ever opened in this tab.
let dirtyCache: DirtyCache | null = null;

export function selectStudioDirty(history: StudioHistory | null): boolean {
  if (!history) return false;
  if (dirtyCache?.present === history.present && dirtyCache.saved === history.saved) {
    return dirtyCache.value;
  }
  const value = isStudioHistoryDirty(history);
  dirtyCache = { present: history.present, saved: history.saved, value };
  return value;
}

export function resetStudioDerivedSelectorCaches(): void {
  dirtyCache = null;
}
