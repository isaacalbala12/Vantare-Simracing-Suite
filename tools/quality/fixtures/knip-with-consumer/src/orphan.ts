// ORPHAN file: exports something, but NO file imports it (its only consumer
// was removed). knip MUST report this file as unused (dead file via graph).
export function orphanFunction(): string {
  return "orphan";
}
