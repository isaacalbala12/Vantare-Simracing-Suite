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

export function readScoringName(record: ScoringRecord): string | undefined {
  return readScoringString(record, "driverName") ?? readScoringString(record, "name");
}

export function readScoringTeam(record: ScoringRecord): string | undefined {
  return readScoringString(record, "teamName") ?? readScoringString(record, "team");
}

export function readScoringClass(record: ScoringRecord): string | undefined {
  return readScoringString(record, "vehicleClass") ?? readScoringString(record, "class");
}

export function readScoringPlace(record: ScoringRecord): number | undefined {
  return readScoringNumber(record, "place") ?? readScoringNumber(record, "position");
}

export function readScoringLaps(record: ScoringRecord): number | undefined {
  return readScoringNumber(record, "totalLaps") ?? readScoringNumber(record, "laps");
}

export function readScoringGap(record: ScoringRecord): number | undefined {
  return (
    readScoringNumber(record, "timeGapToPlayer") ??
    readScoringNumber(record, "timeBehindLeader") ??
    readScoringNumber(record, "gapSeconds")
  );
}

export function readScoringPit(record: ScoringRecord): boolean | undefined {
  return (
    readScoringBoolean(record, "inPits") ??
    readScoringBoolean(record, "pitting") ??
    readScoringBoolean(record, "inGarageStall")
  );
}

export function readScoringTyre(record: ScoringRecord): string | undefined {
  return readScoringString(record, "tireCompound") ?? readScoringString(record, "tyreCompound");
}

export function readScoringPenalties(record: ScoringRecord): number | undefined {
  return readScoringNumber(record, "penalties") ?? readScoringNumber(record, "penaltyCount");
}
