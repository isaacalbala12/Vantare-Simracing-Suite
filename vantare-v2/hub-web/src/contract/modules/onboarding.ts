import {
  onboardingCpuLimit,
  onboardingEquipmentCountMax,
  onboardingKitLimit,
  onboardingRevisionPattern,
  onboardingWidgetKinds,
} from "../generated/onboarding";
import { performanceLevels } from "../generated/settings";
import { exact, integer, oneOf, record } from "../validation-common";

export { onboardingMethods as methods } from "../generated/onboarding";

const revision = (v: unknown): v is string =>
  typeof v === "string" && new RegExp(onboardingRevisionPattern).test(v);
export function isOnboarding(v: unknown): boolean {
  return (
    record(v) &&
    exact(v, [
      "pending",
      "simulators",
      "scanning",
      "equipment",
      "recommendedLevel",
      "layoutReady",
      "layoutRevision",
      "settingsRevision",
      "privateSession",
    ]) &&
    typeof v.pending === "boolean" &&
    typeof v.scanning === "boolean" &&
    typeof v.layoutReady === "boolean" &&
    typeof v.privateSession === "boolean" &&
    Array.isArray(v.simulators) &&
    v.simulators.length === 2 &&
    v.simulators.every((x) => typeof x === "boolean") &&
    oneOf(v.recommendedLevel, performanceLevels) &&
    revision(v.settingsRevision) &&
    (v.layoutRevision === null || revision(v.layoutRevision)) &&
    record(v.equipment) &&
    exact(v.equipment, ["cpu", "cores", "ramGb"]) &&
    (v.equipment.cpu === null ||
      (typeof v.equipment.cpu === "string" &&
        v.equipment.cpu.trim().length > 0 &&
        Array.from(v.equipment.cpu).length <= onboardingCpuLimit &&
        !/\p{Cc}/u.test(v.equipment.cpu))) &&
    (v.equipment.cores === null ||
      (integer(v.equipment.cores) &&
        v.equipment.cores > 0 &&
        v.equipment.cores <= onboardingEquipmentCountMax)) &&
    (v.equipment.ramGb === null ||
      (integer(v.equipment.ramGb) &&
        v.equipment.ramGb > 0 &&
        v.equipment.ramGb <= onboardingEquipmentCountMax))
  );
}
export function isRequest(v: Record<string, unknown>): boolean {
  if (v.method === "onboarding.finish")
    return (
      exact(v, [
        "method",
        "kit",
        "level",
        "show",
        "baseRevision",
        "layoutRevision",
      ]) &&
      Array.isArray(v.kit) &&
      v.kit.length > 0 &&
      v.kit.length <= onboardingKitLimit &&
      new Set(v.kit).size === v.kit.length &&
      v.kit.every((kind) => oneOf(kind, onboardingWidgetKinds)) &&
      oneOf(v.level, performanceLevels) &&
      typeof v.show === "boolean" &&
      revision(v.baseRevision) &&
      (v.layoutRevision === null || revision(v.layoutRevision))
    );
  return (
    (v.method === "onboarding.get" ||
      v.method === "onboarding.skipPrivate" ||
      v.method === "onboarding.prices") &&
    exact(v, ["method"])
  );
}
export function isReply(v: Record<string, unknown>): boolean {
  return v.method === "onboarding.get" || v.method === "onboarding.finish"
    ? exact(v, ["method", "value"]) && isOnboarding(v.value)
    : (v.method === "onboarding.skipPrivate" ||
        v.method === "onboarding.prices") &&
        exact(v, ["method", "accepted"]) &&
        typeof v.accepted === "boolean";
}
export const isError = (v: Record<string, unknown>): boolean =>
  v.kind === "onboardingConflict" && exact(v, ["kind"]);
export const isEvent = (_v: Record<string, unknown>): boolean => false;
