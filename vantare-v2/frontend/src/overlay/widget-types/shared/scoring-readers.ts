export type ScoringRecord = Record<string, unknown>;

export function readScoringString(record: ScoringRecord, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}

export function readScoringNumber(record: ScoringRecord, key: string): number | undefined {
  const value = record[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }
  return value;
}

export function readScoringBoolean(record: ScoringRecord, key: string): boolean | undefined {
  const value = record[key];
  return typeof value === "boolean" ? value : undefined;
}