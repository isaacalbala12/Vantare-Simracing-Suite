export type FunctionalClassAccent = "red" | "blue" | "amber" | "neutral";

function normalizedClassId(value: string): string {
  return value.trim().toUpperCase();
}

export function resolveFunctionalClassAccent(classId: string): FunctionalClassAccent {
  const normalized = normalizedClassId(classId);
  if (normalized.includes("HYPER") || normalized === "HYP" || normalized === "DP") return "red";
  if (normalized.includes("LMP") || normalized === "P2") return "blue";
  if (normalized.includes("GTE") || normalized.includes("GT3")) return "amber";
  return "neutral";
}
