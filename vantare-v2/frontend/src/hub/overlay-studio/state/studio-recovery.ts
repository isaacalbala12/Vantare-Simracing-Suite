import { parseProfileDocumentV3, type ProfileDocumentV3 } from "../../../overlay/core/profile-document";
import type { StudioHistory } from "./studio-history";

export type StudioRecoveryRecord = {
  version: 1;
  profileId: string;
  baseRevision: string;
  capturedAt: string;
  document: ProfileDocumentV3;
};

export type StudioRecoveryReadResult = {
  record: StudioRecoveryRecord | null;
  warning?: string;
};

const RECOVERY_KEY_PREFIX = "vantare:overlay-studio:v3:recovery:";

function recoveryKey(profileId: string): string {
  return `${RECOVERY_KEY_PREFIX}${profileId}`;
}

function isRecoveryRecord(value: unknown): value is StudioRecoveryRecord {
  if (!value || typeof value !== "object") {
    return false;
  }
  const record = value as StudioRecoveryRecord;
  return (
    record.version === 1 &&
    typeof record.profileId === "string" &&
    typeof record.baseRevision === "string" &&
    typeof record.capturedAt === "string" &&
    record.document !== undefined
  );
}

export function createStudioRecoveryStore(storage: Storage) {
  return {
    read(profileId: string, currentRevision?: string): StudioRecoveryReadResult {
      const raw = storage.getItem(recoveryKey(profileId));
      if (!raw) {
        return { record: null };
      }
      try {
        const parsed = JSON.parse(raw) as unknown;
        if (!isRecoveryRecord(parsed)) {
          storage.removeItem(recoveryKey(profileId));
          return { record: null, warning: "removed invalid recovery payload" };
        }
        const document = parseProfileDocumentV3(parsed.document);
        const record: StudioRecoveryRecord = {
          ...parsed,
          document,
        };
        if (currentRevision && record.baseRevision !== currentRevision) {
          return { record, warning: "recovery base revision differs from disk revision" };
        }
        return { record };
      } catch {
        storage.removeItem(recoveryKey(profileId));
        return { record: null, warning: "removed corrupt recovery payload" };
      }
    },

    write(record: StudioRecoveryRecord): { ok: true } | { ok: false; warning: string } {
      try {
        storage.setItem(recoveryKey(record.profileId), JSON.stringify(record));
        return { ok: true };
      } catch (error) {
        const message = error instanceof Error ? error.message : "recovery storage write failed";
        return { ok: false, warning: message };
      }
    },

    clear(profileId: string): void {
      storage.removeItem(recoveryKey(profileId));
    },
  };
}

export function buildHistoryFromRecovery(
  savedDocument: ProfileDocumentV3,
  recoveredDocument: ProfileDocumentV3,
  limit = 100,
): StudioHistory {
  return {
    past: [structuredClone(savedDocument)],
    present: structuredClone(recoveredDocument),
    future: [],
    saved: structuredClone(savedDocument),
    limit,
  };
}