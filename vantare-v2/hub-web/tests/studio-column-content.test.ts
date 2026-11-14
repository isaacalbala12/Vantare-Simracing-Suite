import { expect, it } from "vitest";
import { studioWidgetDefaults } from "../src/contract/generated/studio";
import { applyWidgetSettings } from "../src/mock/modules/studio";
import {
  canResetColumns,
  contentColumns,
  editColumn,
  requiredColumn,
  resetColumns,
} from "../src/renderer/screens/studio/content-columns";

const settings =
  (): import("../src/contract/generated/studio").WidgetSettings & {
    kind: "standings";
  } =>
    structuredClone(
      studioWidgetDefaults.standings,
    ) as unknown as import("../src/contract/generated/studio").WidgetSettings & {
      kind: "standings";
    };
it("inherits only absent session columns; an explicit empty list stays empty", () => {
  const s: import("../src/contract/generated/studio").StandingsWidgetSettings & {
    kind: "standings";
  } = settings();
  delete s.practiceColumns;
  expect(contentColumns(s, "practice")).toEqual(s.columns);
  s.practiceColumns = [];
  expect(contentColumns(s, "practice")).toEqual([]);
  s.columns = null;
  delete s.practiceColumns;
  expect(
    contentColumns(s, "practice")
      ?.filter((c) => c.enabled)
      .map((c) => c.metricId),
  ).toEqual(["position", "positionsGained", "driverName", "vehicle", "gap"]);
});
it("detaches both inherited sessions before editing Race without resending their values", () => {
  const s: import("../src/contract/generated/studio").StandingsWidgetSettings & {
    kind: "standings";
  } = settings();
  delete s.practiceColumns;
  delete s.qualifyingColumns;
  const before = structuredClone(s);
  const patch = editColumn(s, "race", "gap", { enabled: false });
  expect(s).toEqual(before);
  expect(patch).toMatchObject({
    kind: "standings",
    practiceColumns: s.columns?.map((c) => ({ metric: c.metricId })),
    qualifyingColumns: s.columns?.map((c) => ({ metric: c.metricId })),
  });
  expect(patch && "columns" in patch ? patch.columns : undefined).toEqual(
    s.columns?.map((c) =>
      c.metricId === "gap"
        ? { metric: "gap", enabled: false }
        : { metric: c.metricId },
    ),
  );
  if (!patch) throw Error("patch");
  const result = applyWidgetSettings(s, patch);
  if (result?.kind !== "standings") throw Error("standings");
  expect(result.practiceColumns).toEqual(before.columns);
  expect(result.qualifyingColumns).toEqual(before.columns);
  expect(result.columns?.find((c) => c.metricId === "gap")?.enabled).toBe(
    false,
  );
});
it("edits Practice by identity while preserving saved ids and time formatting", () => {
  const s = settings();
  if (!s.practiceColumns?.[2]) throw Error("Practice fixture");
  s.practiceColumns[2].id = "private-id";
  const before = structuredClone(s);
  const patch = editColumn(s, "practice", "driverName", {
    format: { mode: "surname" },
  });
  expect(patch && Object.keys(patch)).toEqual(["kind", "practiceColumns"]);
  expect(patch).not.toHaveProperty("columns");
  expect(s).toEqual(before);
  if (!patch) throw Error("patch");
  const result = applyWidgetSettings(s, patch);
  if (result?.kind !== "standings") throw Error("standings");
  expect(result.columns).toEqual(before.columns);
  expect(result.qualifyingColumns).toEqual(before.qualifyingColumns);
  expect(
    result.practiceColumns?.find((c) => c.metricId === "driverName"),
  ).toMatchObject({
    id: "private-id",
    format: { mode: "surname", display: null, decimals: null },
  });
});
it.each(["position", "driverName"])("never hides required %s", (metric) => {
  expect(requiredColumn(settings(), metric)).toBe(true);
  expect(editColumn(settings(), "race", metric, { enabled: false })).toBeNull();
});
it("resets just the selected session using the native generated preset", () => {
  const s = settings();
  const patch = resetColumns(s, "practice");
  expect(patch && Object.keys(patch)).toEqual(["kind", "practiceColumns"]);
  expect(patch).toMatchObject({
    practiceColumns: studioWidgetDefaults.standings.practiceColumns.map(
      (c) => ({
        metric: c.metricId,
        enabled: c.enabled,
        widthPreset: c.widthPreset,
      }),
    ),
  });
});
it("does not pretend to reset a time format the current request cannot change", () => {
  const s: import("../src/contract/generated/studio").StandingsWidgetSettings & {
    kind: "standings";
  } = settings();
  const time = s.columns?.find((c) => c.metricId === "lastLap");
  if (!time) throw Error("time");
  time.format.display = "compact";
  time.format.decimals = 1;
  expect(canResetColumns(s, "race")).toBe(false);
  expect(resetColumns(s, "race")).toBeNull();
  const patch = editColumn(s, "race", "gap", { enabled: false });
  if (!patch) throw Error("patch");
  const result = applyWidgetSettings(s, patch);
  if (result?.kind !== "standings") throw Error("standings");
  expect(
    result.columns?.find((c) => c.metricId === "lastLap")?.format,
  ).toMatchObject({ display: "compact", decimals: 1 });
});
it.each(["unknown", "duplicate"])(
  "refuses a destructive partial list for %s columns",
  (kind) => {
    const s: import("../src/contract/generated/studio").StandingsWidgetSettings & {
      kind: "standings";
    } = settings();
    if (!s.columns) throw Error("columns");
    s.columns[0].metricId =
      kind === "unknown" ? "future-metric" : s.columns[1].metricId;
    expect(editColumn(s, "race", "gap", { enabled: false })).toBeNull();
    expect(canResetColumns(s, "race")).toBe(false);
  },
);
