// Tier utilities for the official LMU series schedule.
// These are pure data transformations with no React dependencies.

export const TIER_LABELS: Record<string, string> = {
  beginner: "Bronce",
  intermediate: "Plata",
  advanced: "Oro",
  weekly: "Weekly",
};

export const TIER_ACCENT: Record<string, string> = {
  beginner: "bg-amber-500",
  intermediate: "bg-blue-500",
  advanced: "bg-yellow-500",
  weekly: "bg-red-500",
};

export function tierLabel(tier: string): string {
  return TIER_LABELS[tier] ?? tier;
}
