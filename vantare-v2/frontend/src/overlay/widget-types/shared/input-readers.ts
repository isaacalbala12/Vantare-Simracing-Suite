export function readFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function readNonNegativeNumber(value: unknown): number | undefined {
  const number = readFiniteNumber(value);
  return number === undefined ? undefined : Math.max(0, number);
}

export function readNormalizedInput(value: unknown): number | undefined {
  const number = readFiniteNumber(value);
  if (number === undefined) {
    return undefined;
  }
  const normalized = number > 1 ? number / 100 : number;
  return Math.max(0, Math.min(1, normalized));
}
