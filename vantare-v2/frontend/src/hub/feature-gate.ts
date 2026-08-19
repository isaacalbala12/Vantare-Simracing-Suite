import { useAccess } from "../lib/access";
import { getFeatureGate, type FeatureId } from "../lib/access-policy";

/** Resuelve un gate de producto para controles Orbit sin montar UI legada. */
export function useFeatureGate(feature: FeatureId) {
  const access = useAccess();
  const gate = getFeatureGate(access, feature);
  return { allowed: gate.allowed, gate };
}
