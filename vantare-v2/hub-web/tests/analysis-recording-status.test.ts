import { expect, it, vi } from "vitest";
import type { AnalysisRecordingStatus } from "../src/contract/generated/analysis";
import { AnalysisController } from "../src/renderer/app/AnalysisController";
import {
  deletedRecordings,
  recordingIndicator,
  recordingUsage,
} from "../src/renderer/app/analysis-recording-status";

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
  await vi.waitFor(() => expect(controller.snapshot().loading).toBe(false));
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
  ).toBe("limit");
});
