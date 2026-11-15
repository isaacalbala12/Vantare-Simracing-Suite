import { expect, it } from "vitest";
import type { WidgetSettingsPatch } from "../src/contract/generated/studio";
import {
  studioAdditionalCases,
  studioAdditionalOptions,
  studioWidgetDefaults,
} from "../src/contract/generated/studio";
import {
  isWidgetSettings,
  isWidgetSettingsPatch,
} from "../src/contract/studio-widget-settings";
import { applyWidgetSettings } from "../src/mock/modules/studio";

it("accepts all 48 native control vectors and matches native outcomes in the mock", () => {
  expect(studioAdditionalCases).toHaveLength(52);
  const kinds = new Set<string>();
  for (const entry of studioAdditionalCases) {
    kinds.add(entry.before.kind);
    const before: unknown = structuredClone(entry.before);
    const patch = structuredClone(entry.patch);
    expect(
      isWidgetSettings(before, entry.before.kind),
      JSON.stringify(patch),
    ).toBe(true);
    if (!isWidgetSettings(before, entry.before.kind) || !before)
      throw new Error("Invalid native vector");
    expect(isWidgetSettingsPatch(patch), JSON.stringify(patch)).toBe(true);
    expect(
      applyWidgetSettings(before, patch as WidgetSettingsPatch),
      JSON.stringify(patch),
    ).toEqual(entry.after);
    expect(before).toEqual(entry.before);
  }
  expect(kinds.size).toBe(14);
});
it("keeps internal and unsupported fields read-only and fails closed on wrong families", () => {
  for (const [kind, field] of [
    ["broadcast-tower", "showSof"],
    ["delta-trace", "showSectors"],
    ["delta-trace", "showTrackMap"],
    ["pedals-telemetry", "showPosition"],
    ["track-map", "showTrackLabel"],
    ["track-weather", "showAmbient"],
    ["track-weather", "showTrack"],
    ["track-weather", "showRain"],
    ["track-weather", "showWind"],
    ["session-alerts", "companionFor"],
  ]) {
    expect(isWidgetSettingsPatch({ kind, [field]: false })).toBe(false);
  }
  expect(
    applyWidgetSettings(studioWidgetDefaults.radar, {
      kind: "track-map",
      transparent: true,
    }),
  ).toBeNull();
});
it("exports native wheel choices, the color boundary and the pending start-signal limitation", () => {
  expect(studioAdditionalOptions.pedalsTelemetry.wheels).toContain(
    "ferrari-499p",
  );
  expect(
    isWidgetSettingsPatch({ kind: "racing-flags", textColor: "#a1B2c3" }),
  ).toBe(true);
  expect(
    isWidgetSettingsPatch({ kind: "racing-flags", textColor: "#Ａ１Ｂ２Ｃ３" }),
  ).toBe(false);
  expect(studioAdditionalOptions.sessionAlerts.startSignalsAvailable).toBe(
    false,
  );
  expect(
    isWidgetSettingsPatch({ kind: "session-alerts", thresholds: [5] }),
  ).toBe(false);
  expect(
    isWidgetSettingsPatch({
      kind: "session-alerts",
      threshold: { index: 5, minutes: 1 },
    }),
  ).toBe(false);
  expect(
    isWidgetSettingsPatch({
      kind: "session-alerts",
      threshold: { index: 0, minutes: 61 },
    }),
  ).toBe(false);
});
