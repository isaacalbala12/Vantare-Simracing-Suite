/** LMU uses -1 for reverse and 0 for neutral. Other invalid values stay unknown. */
export function formatGear(value: number | undefined): string {
  if (value === undefined || !Number.isInteger(value) || value < -1) return "\u2014";
  if (value === -1) return "R";
  return value === 0 ? "N" : String(value);
}
