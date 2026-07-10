import { describe, expect, it, vi } from "vitest";
import { deltaDefinition } from "../../../overlay/widget-types/delta/delta-definition";
import type { ProfileDocumentV3 } from "../../../overlay/core/profile-document";
import {
  buildHistoryFromRecovery,
  createStudioRecoveryStore,
  type StudioRecoveryRecord,
} from "./studio-recovery";
import { isStudioHistoryDirty, undoStudioHistory } from "./studio-history";

function buildDocument(): ProfileDocumentV3 {
  return {
    schemaVersion: 3,
    id: "profile-1",
    name: "Test Profile",
    displayMode: "edit",
    monitorIndex: 0,
    layouts: {
      general: {
        type: "general",
        widgets: [deltaDefinition.createDefault("delta-main")],
      },
    },
  };
}

function buildRecord(overrides: Partial<StudioRecoveryRecord> = {}): StudioRecoveryRecord {
  return {
    version: 1,
    profileId: "profile-1",
    baseRevision: "rev-1",
    capturedAt: "2026-07-10T12:00:00.000Z",
    document: buildDocument(),
    ...overrides,
  };
}

describe("createStudioRecoveryStore", () => {
  it("reads and writes a valid recovery record", () => {
    const storage = new Map<string, string>();
    const store = createStudioRecoveryStore({
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => {
        storage.set(key, value);
      },
      removeItem: (key) => {
        storage.delete(key);
      },
    } as Storage);

    const record = buildRecord();
    expect(store.write(record)).toEqual({ ok: true });
    expect(store.read("profile-1")).toEqual({ record });
  });

  it("clears corrupt json and invalid schema payloads", () => {
    const storage = new Map<string, string>([
      ["vantare:overlay-studio:v3:recovery:profile-1", "{not-json"],
      ["vantare:overlay-studio:v3:recovery:profile-2", JSON.stringify({ version: 9 })],
    ]);
    const store = createStudioRecoveryStore({
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: (key) => storage.delete(key),
    } as Storage);

    expect(store.read("profile-1")).toEqual({
      record: null,
      warning: "removed corrupt recovery payload",
    });
    expect(storage.has("vantare:overlay-studio:v3:recovery:profile-1")).toBe(false);

    expect(store.read("profile-2")).toEqual({
      record: null,
      warning: "removed invalid recovery payload",
    });
    expect(storage.has("vantare:overlay-studio:v3:recovery:profile-2")).toBe(false);
  });

  it("warns when the recovery revision differs from disk", () => {
    const storage = new Map<string, string>();
    const store = createStudioRecoveryStore({
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: (key) => storage.delete(key),
    } as Storage);
    store.write(buildRecord({ baseRevision: "rev-old" }));

    expect(store.read("profile-1", "rev-new")).toEqual({
      record: buildRecord({ baseRevision: "rev-old" }),
      warning: "recovery base revision differs from disk revision",
    });
  });

  it("returns a non-fatal warning when storage quota is exceeded", () => {
    const store = createStudioRecoveryStore({
      getItem: () => null,
      setItem: () => {
        throw new DOMException("quota exceeded", "QuotaExceededError");
      },
      removeItem: vi.fn(),
    } as Storage);

    expect(store.write(buildRecord())).toEqual({
      ok: false,
      warning: "quota exceeded",
    });
  });

  it("clears recovery drafts explicitly", () => {
    const storage = new Map<string, string>();
    const store = createStudioRecoveryStore({
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: (key) => storage.delete(key),
    } as Storage);
    store.write(buildRecord());
    store.clear("profile-1");
    expect(store.read("profile-1")).toEqual({ record: null });
  });
});

describe("buildHistoryFromRecovery", () => {
  it("uses the disk snapshot as saved and the recovered draft as present", () => {
    const saved = buildDocument();
    const recovered = structuredClone(saved);
    recovered.layouts.general.widgets[0].layout.x = 420;

    const history = buildHistoryFromRecovery(saved, recovered);
    expect(isStudioHistoryDirty(history)).toBe(true);
    const undone = undoStudioHistory(history);
    expect(undone.present.layouts.general.widgets[0].layout.x).toBe(64);
    expect(isStudioHistoryDirty(undone)).toBe(false);
  });
});