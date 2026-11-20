import { expect, it, vi } from "vitest";
import type {
  AnalysisRecordingStatus,
  AnalysisRequest,
} from "../src/contract/generated/analysis";
import type { Reply } from "../src/contract/generated/contract";
import { AnalysisController } from "../src/renderer/app/AnalysisController";
import {
  deletedRecordings,
  recordingIndicator,
  recordingUsage,
} from "../src/renderer/app/analysis-recording-status";
import { HostFailure } from "../src/renderer/bridge/client";
import { recordingStatusText } from "../src/renderer/i18n/recording-status.es";

const status: AnalysisRecordingStatus = {
  state: "recording",
  cause: null,
  rowId: null,
  startedAtMs: 10,
  durableWatermark: "9007199254740993",
  attempted: "9007199254740995",
  limits: { maxRecordings: 2, maxBytes: 100 },
  lastPrune: {
    atMs: 20,
    items: [
      {
        name: "series-1-2.duckdb",
        modifiedAtMs: 1,
        sizeBytes: 30,
        reason: "count",
        result: "deleted",
      },
      {
        name: "series-2-3.duckdb",
        modifiedAtMs: 2,
        sizeBytes: 40,
        reason: "bytes",
        result: "skippedInUse",
      },
      {
        name: "series-3-4.duckdb",
        modifiedAtMs: 3,
        sizeBytes: 50,
        reason: "bytes",
        result: "error",
      },
      {
        name: "series-4-5.duckdb.creating-1-2",
        modifiedAtMs: 4,
        sizeBytes: 60,
        reason: "orphan",
        result: "deleted",
      },
    ],
  },
};

it("counts only successfully deleted recordings and their bytes", () => {
  const batch = deletedRecordings(status);
  expect(batch).toMatchObject({ atMs: 20, bytes: 30 });
  expect(batch?.items.map((item) => item.name)).toEqual(["series-1-2.duckdb"]);
  expect(deletedRecordings(null)).toBeUndefined();
});

it("uses actual catalog usage and gives failures priority over quota", () => {
  const rows = [
    { id: "recent", startedAtMs: 10, sizeBytes: 100, recording: true },
  ];
  const usage = recordingUsage(rows, status.limits);
  expect(usage).toMatchObject({ count: 1, bytes: 100, atLimit: true });
  expect(recordingIndicator(status, true, true, usage.atLimit, true)).toBe(
    "limit",
  );
  expect(
    recordingIndicator(
      { ...status, state: "degraded" },
      true,
      true,
      true,
      true,
    ),
  ).toBe("degraded");
  expect(
    recordingIndicator(
      { ...status, state: "stopped", cause: "writerDown" },
      true,
      false,
      true,
      false,
    ),
  ).toBe("stopped");
  expect(recordingIndicator(status, false, true, false, true)).toBe(
    "pendingOff",
  );
  expect(recordingIndicator(null, false, false, false, false)).toBe("disabled");
  expect(recordingIndicator(null, true, false, false, false)).toBe("pendingOn");
  expect(recordingIndicator(null, true, true, false, false)).toBe("idle");
  expect(recordingIndicator(undefined, true, true, false, false)).toBe(
    "unavailable",
  );
});

it("loads status after the catalog without holding the catalog or reader open", async () => {
  const calls: string[] = [];
  const controller = new AnalysisController({
    request: async ({ method }) => {
      calls.push(method);
      if (method === "analysis.catalog")
        return { method, recordings: [], max: 256 };
      if (method === "analysis.status") return { method, status };
      if (method === "analysis.cancel") return { method, cancelled: false };
      throw Error(method);
    },
  });
  controller.load();
  await vi.waitFor(() =>
    expect(controller.snapshot().recordingStatus).toEqual(status),
  );
  expect(calls).toEqual([
    "analysis.cancel",
    "analysis.catalog",
    "analysis.status",
  ]);
  expect(controller.snapshot().loading).toBe(false);
  controller.dispose();
});

it("keeps catalog data available when status fails", async () => {
  const controller = new AnalysisController({
    request: async ({ method }) => {
      if (method === "analysis.catalog")
        return { method, recordings: [], max: 256 };
      if (method === "analysis.cancel") return { method, cancelled: false };
      throw Error("status unavailable");
    },
  });
  controller.load();
  await vi.waitFor(() =>
    expect(controller.snapshot().recordingStatusPending).toBe(false),
  );
  expect(controller.snapshot().loading).toBe(false);
  expect(controller.snapshot().error).toBeUndefined();
  expect(controller.snapshot().recordingStatus).toBeUndefined();
  controller.dispose();
});

it("treats a clean stop as idle and a failed writer as stopped", () => {
  const clean = { ...status, state: "stopped" as const };
  expect(recordingIndicator(clean, true, true, false, false)).toBe("idle");
  expect(recordingIndicator(clean, false, false, false, false)).toBe(
    "disabled",
  );
  expect(
    recordingIndicator(
      { ...status, state: "degraded", cause: "writerDown" },
      true,
      true,
      false,
      true,
    ),
  ).toBe("stopped");
  expect(
    recordingIndicator(
      { ...status, state: "degraded", cause: "quotaUnmet" },
      true,
      true,
      false,
      true,
    ),
  ).toBe("quotaUnmet");
});

it("says why nothing is recorded when the recordings folder is not a folder", () => {
  // What the host reports for a link, a junction or a file in its place.
  const unusable = {
    ...status,
    state: "stopped" as const,
    cause: "invalidDirectory" as const,
    limits: { maxRecordings: 0, maxBytes: 0 },
  };
  // Whatever the saved choice says: nothing is recorded, and the user is told why.
  for (const [enabled, atStart] of [
    [true, true],
    [true, false],
    [false, false],
  ])
    expect(recordingIndicator(unusable, enabled, atStart, false, false)).toBe(
      "folderUnusable",
    );
  // The core reports its own trouble with the folder as a degraded recording.
  expect(
    recordingIndicator(
      { ...status, state: "degraded", cause: "invalidDirectory" },
      true,
      true,
      false,
      false,
    ),
  ).toBe("stopped");
  // A text of its own, without paths: the renderer never sees one.
  const text = recordingStatusText as Record<string, unknown>;
  expect(text.folderUnusable).toBeTruthy();
  expect(text.folderUnusableHelp).toMatch(/enlace.*unión.*desactivadas/);
  expect(text.folderUnusableHelp).not.toMatch(/[\\/:]/);
});

it("distinguishes a finish timeout from a clean stop", () => {
  for (const state of ["stopped", "degraded"] as const) {
    expect(
      recordingIndicator(
        { ...status, state, cause: "finishTimeout" },
        true,
        true,
        false,
        false,
      ),
    ).toBe("stopped");
  }
});

it("retains the status and the last deletion batch during a second catalog load", async () => {
  let statusReads = 0;
  let resolveStatus: (value: typeof status | null) => void = () => {};
  const controller = new AnalysisController({
    request: async ({ method }) => {
      if (method === "analysis.catalog")
        return { method, recordings: [], max: 256 };
      if (method === "analysis.cancel") return { method, cancelled: false };
      if (method === "analysis.status") {
        statusReads++;
        return {
          method,
          status:
            statusReads === 1
              ? status
              : await new Promise<typeof status | null>((resolve) => {
                  resolveStatus = resolve;
                }),
        };
      }
      throw Error(method);
    },
  });
  expect(controller.snapshot().recordingStatusPending).toBe(true);
  controller.load();
  await vi.waitFor(() =>
    expect(controller.snapshot().recordingStatus).toBe(status),
  );
  const seen: unknown[] = [];
  controller.subscribe(() => seen.push(controller.snapshot().recordingStatus));
  controller.load();
  await vi.waitFor(() => expect(statusReads).toBe(2));
  expect(controller.snapshot().recordingStatus).toBe(status);
  resolveStatus(null);
  await vi.waitFor(() =>
    expect(controller.snapshot().recordingStatus).toBeNull(),
  );
  expect(controller.snapshot().recordingStatusPending).toBe(false);
  expect(seen).not.toContain(undefined);
  controller.dispose();
});

it("keeps recording with a degraded indicator when pruning is incomplete", () => {
  expect(
    recordingIndicator(
      { ...status, state: "degraded", cause: "pruneIncomplete" },
      true,
      true,
      true,
      true,
    ),
  ).toBe("degraded");
});

it("refreshes after 12 seconds, preserves a good result on errors, and does not overlap", async () => {
  vi.useFakeTimers();
  let read = 0;
  let resolveRefresh: (reply: Reply) => void = () => {};
  let signal: AbortSignal | undefined;
  const request = vi.fn(
    async (
      { method }: AnalysisRequest,
      _onSent?: () => void,
      abort?: AbortSignal,
    ): Promise<Reply> => {
      if (method === "analysis.catalog")
        return { method, recordings: [], max: 256 };
      if (method === "analysis.cancel") return { method, cancelled: false };
      if (method !== "analysis.status") throw Error(method);
      read++;
      signal = abort;
      if (read === 1) return { method, status: null };
      if (read === 2) throw new HostFailure({ kind: "busy" });
      if (read === 3) return { method, status };
      if (read === 4) throw new HostFailure({ kind: "io" });
      return new Promise<Reply>((resolve) => {
        resolveRefresh = resolve;
      });
    },
  );
  const controller = new AnalysisController(
    { request },
    {
      setTimeout: globalThis.setTimeout,
      clearTimeout: globalThis.clearTimeout,
    },
  );
  try {
    controller.load();
    await vi.advanceTimersByTimeAsync(0);
    expect(controller.snapshot().recordingStatus).toBeNull();
    await vi.advanceTimersByTimeAsync(11_999);
    expect(read).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(read).toBe(2);
    expect(controller.snapshot().recordingStatus).toBeNull();
    await vi.advanceTimersByTimeAsync(12_000);
    expect(controller.snapshot().recordingStatus).toBe(status);
    await vi.advanceTimersByTimeAsync(12_000);
    expect(read).toBe(4);
    expect(controller.snapshot().recordingStatus).toBe(status);
    await vi.advanceTimersByTimeAsync(12_000);
    expect(read).toBe(5);
    controller.load();
    await vi.advanceTimersByTimeAsync(36_000);
    expect(read).toBe(5);
    controller.setRecordingStatusVisible(false);
    controller.setRecordingStatusVisible(true);
    expect(read).toBe(5);
    resolveRefresh({ method: "analysis.status", status: null });
    await vi.advanceTimersByTimeAsync(0);
    expect(controller.snapshot().recordingStatus).toBe(status);
    await vi.advanceTimersByTimeAsync(12_000);
    expect(read).toBe(6);
    controller.dispose();
    expect(signal?.aborted).toBe(true);
    resolveRefresh({ method: "analysis.status", status: null });
    await vi.advanceTimersByTimeAsync(36_000);
    expect(read).toBe(6);
    expect(controller.snapshot().recordingStatus).toBe(status);
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    controller.dispose();
    vi.useRealTimers();
  }
});

it("uses a successful idle or clean stop even when the catalog still has an older live row", () => {
  expect(recordingIndicator(null, true, true, false, true)).toBe("idle");
  expect(
    recordingIndicator(
      { ...status, state: "stopped" },
      true,
      true,
      false,
      true,
    ),
  ).toBe("idle");
  expect(recordingIndicator(undefined, true, true, false, true)).toBe(
    "recording",
  );
});
