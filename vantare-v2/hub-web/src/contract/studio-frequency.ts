import type { PerformanceLevel } from "./generated/settings";
import { performanceLevels } from "./generated/settings";
import type { FrequencyView, WidgetKind } from "./generated/studio";
import {
  studioFrequencyCases,
  studioFrequencyOptions,
} from "./generated/studio";
import { exact, integer, oneOf, record } from "./validation-common";

// The mock consumes Rust's cadence vectors; it never creates another cadence table.
export function frequencyFor(
  kind: WidgetKind,
  level: PerformanceLevel,
  overrideHz: number | null,
): FrequencyView {
  const inherited = studioFrequencyCases.find(
    (value) =>
      value.kind === kind && value.level === level && value.overrideHz === null,
  );
  if (!inherited) throw new Error("Missing native frequency vector");
  if (kind === "racing-flags")
    return { level, overrideHz, appliedHz: 0, source: "snapshot" };
  return overrideHz === null
    ? { ...inherited.view }
    : { level, overrideHz, appliedHz: overrideHz, source: "override" };
}
export function isFrequencyView(
  value: unknown,
  kind: WidgetKind,
): value is FrequencyView {
  if (
    !record(value) ||
    !exact(value, ["level", "overrideHz", "appliedHz", "source"]) ||
    !oneOf(value.level, performanceLevels) ||
    !integer(value.appliedHz) ||
    !(
      value.overrideHz === null ||
      (integer(value.overrideHz) &&
        studioFrequencyOptions.stored.some((hz) => hz === value.overrideHz))
    )
  )
    return false;
  const expected = frequencyFor(kind, value.level, value.overrideHz);
  return (
    value.source === expected.source && value.appliedHz === expected.appliedHz
  );
}
export function isFrequencyChange(value: unknown): value is number | null {
  return (
    value === null ||
    (integer(value) &&
      studioFrequencyOptions.choices.some((hz) => hz === value))
  );
}
