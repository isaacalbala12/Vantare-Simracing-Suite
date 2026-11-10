// Stable product routes; workers add their entry module without editing this registry.
export const sectionIds = [
  "home",
  "launcher",
  "studio",
  "roadmap",
  "testing",
  "calendar",
  "strategy",
  "engineer",
  "settings",
  "notifications",
  "workshop",
  "analysis",
  "account",
] as const;
export type Section = (typeof sectionIds)[number];
export const isSection = (value: string): value is Section =>
  sectionIds.some((id) => id === value);
