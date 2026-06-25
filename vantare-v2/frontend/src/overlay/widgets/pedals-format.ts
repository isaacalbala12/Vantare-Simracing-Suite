export function clampPedalPercent(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 100) return 100;
  return Math.round(value);
}

export function formatPedalHeightPercent(value: unknown): string {
  return `${clampPedalPercent(value)}%`;
}
