export const STRATEGY_MANUAL_INPUT_VERSION = "strategy.manual.v1" as const;

export type StrategyQuickField =
  | "averageLapSeconds"
  | "fuelCapacityLitres"
  | "fuelUsableLitres"
  | "fuelStartLitres"
  | "fuelPerLapLitres"
  | "fuelFormationLitres"
  | "fuelReserveLitres"
  | "virtualEnergyCapacityPercent"
  | "virtualEnergyUsablePercent"
  | "virtualEnergyStartPercent"
  | "virtualEnergyPerLapPercent"
  | "virtualEnergyFormationPercent"
  | "virtualEnergyReservePercent"
  | "tyreWearPerLapPercent"
  | "pitLossPerStopSeconds"
  | "repairSeconds"
  | "penaltySeconds";

export type StrategyLapField =
  | "averageLapSeconds"
  | "fuelPerLapLitres"
  | "virtualEnergyPerLapPercent"
  | "tyreWearPerLapPercent";

export type StrategyInputCorrection = {
  readonly value: number;
  readonly reason: string;
  readonly correctedAt: string;
};

export type StrategyInputValue = {
  readonly original: number;
  readonly correction?: StrategyInputCorrection;
};

export type StrategyQuickInputs = Readonly<Record<StrategyQuickField, StrategyInputValue>>;

export type StrategyLapCorrection = {
  readonly lapNumber: number;
  readonly averageLapSeconds?: StrategyInputValue;
  readonly fuelPerLapLitres?: StrategyInputValue;
  readonly virtualEnergyPerLapPercent?: StrategyInputValue;
  readonly tyreWearPerLapPercent?: StrategyInputValue;
};

export type StrategyManualInputs = {
  readonly version: typeof STRATEGY_MANUAL_INPUT_VERSION;
  readonly quick: StrategyQuickInputs;
  readonly lapCorrections: readonly StrategyLapCorrection[];
};

export type StrategyEffectiveLapValue = {
  readonly original: number;
  readonly value: number;
  readonly corrected: boolean;
  readonly reason?: string;
};

export type StrategyEffectiveLapRow = Readonly<Record<StrategyLapField, StrategyEffectiveLapValue>> & {
  readonly lapNumber: number;
};

export type StrategyManualDocument = {
  readonly stints: readonly { readonly lapCount: number }[];
  readonly manualInputs: StrategyManualInputs;
};

export type StrategyManualInputErrorCode = "invalid_manual_input" | "lap_out_of_range";

export class StrategyManualInputError extends Error {
  readonly code: StrategyManualInputErrorCode;
  readonly field: string;

  constructor(code: StrategyManualInputErrorCode, field: string, message: string) {
    super(message);
    this.name = "StrategyManualInputError";
    this.code = code;
    this.field = field;
  }
}

type FieldRule = { readonly min: number; readonly max: number; readonly positive?: boolean };

const FIELD_RULES: Readonly<Record<StrategyQuickField, FieldRule>> = {
  averageLapSeconds: { min: 0, max: 3_600, positive: true },
  fuelCapacityLitres: { min: 0, max: 2_000, positive: true },
  fuelUsableLitres: { min: 0, max: 2_000, positive: true },
  fuelStartLitres: { min: 0, max: 2_000 },
  fuelPerLapLitres: { min: 0, max: 2_000, positive: true },
  fuelFormationLitres: { min: 0, max: 2_000 },
  fuelReserveLitres: { min: 0, max: 2_000 },
  virtualEnergyCapacityPercent: { min: 0, max: 100, positive: true },
  virtualEnergyUsablePercent: { min: 0, max: 100, positive: true },
  virtualEnergyStartPercent: { min: 0, max: 100 },
  virtualEnergyPerLapPercent: { min: 0, max: 100, positive: true },
  virtualEnergyFormationPercent: { min: 0, max: 100 },
  virtualEnergyReservePercent: { min: 0, max: 100 },
  tyreWearPerLapPercent: { min: 0, max: 100 },
  pitLossPerStopSeconds: { min: 0, max: 86_400 },
  repairSeconds: { min: 0, max: 86_400 },
  penaltySeconds: { min: 0, max: 86_400 },
};

const LAP_FIELDS: readonly StrategyLapField[] = [
  "averageLapSeconds",
  "fuelPerLapLitres",
  "virtualEnergyPerLapPercent",
  "tyreWearPerLapPercent",
];

export function createDefaultStrategyManualInputs(): StrategyManualInputs {
  return freeze({
    version: STRATEGY_MANUAL_INPUT_VERSION,
    quick: {
      averageLapSeconds: input(138.4),
      fuelCapacityLitres: input(100),
      fuelUsableLitres: input(100),
      fuelStartLitres: input(100),
      fuelPerLapLitres: input(4.8),
      fuelFormationLitres: input(0),
      fuelReserveLitres: input(0),
      virtualEnergyCapacityPercent: input(100),
      virtualEnergyUsablePercent: input(100),
      virtualEnergyStartPercent: input(100),
      virtualEnergyPerLapPercent: input(2),
      virtualEnergyFormationPercent: input(0),
      virtualEnergyReservePercent: input(0),
      tyreWearPerLapPercent: input(0.65),
      pitLossPerStopSeconds: input(22.4),
      repairSeconds: input(0),
      penaltySeconds: input(0),
    },
    lapCorrections: [],
  });
}

export function parseStrategyManualInputs(value: unknown, totalLaps: number): StrategyManualInputs {
  if (!isRecord(value) || value.version !== STRATEGY_MANUAL_INPUT_VERSION || !isRecord(value.quick)) {
    throw invalid("manualInputs", "unsupported manual input document");
  }
  if (!Number.isSafeInteger(totalLaps) || totalLaps < 1) {
    throw invalid("stints", "the plan must contain at least one lap");
  }

  const quick = {} as Record<StrategyQuickField, StrategyInputValue>;
  for (const field of Object.keys(FIELD_RULES) as StrategyQuickField[]) {
    quick[field] = parseInputValue(value.quick[field], field, FIELD_RULES[field]);
  }
  if (effectiveValue(quick.fuelUsableLitres) > effectiveValue(quick.fuelCapacityLitres)) {
    throw invalid("fuelUsableLitres", "usable Fuel cannot exceed tank capacity");
  }
  if (effectiveValue(quick.fuelStartLitres) > effectiveValue(quick.fuelCapacityLitres)) {
    throw invalid("fuelStartLitres", "starting Fuel cannot exceed tank capacity");
  }
  if (effectiveValue(quick.virtualEnergyUsablePercent) > effectiveValue(quick.virtualEnergyCapacityPercent)) {
    throw invalid("virtualEnergyUsablePercent", "usable Virtual Energy cannot exceed capacity");
  }
  if (effectiveValue(quick.virtualEnergyStartPercent) > effectiveValue(quick.virtualEnergyCapacityPercent)) {
    throw invalid("virtualEnergyStartPercent", "starting Virtual Energy cannot exceed capacity");
  }
  if (!Array.isArray(value.lapCorrections)) {
    throw invalid("lapCorrections", "lap corrections must be an array");
  }
  const seen = new Set<number>();
  const lapCorrections = value.lapCorrections.map((raw, index) => {
    if (!isRecord(raw) || !Number.isSafeInteger(raw.lapNumber)) {
      throw invalid(`lapCorrections.${index}.lapNumber`, "lap number must be an integer");
    }
    const lapNumber = Number(raw.lapNumber);
    if (lapNumber < 1 || lapNumber > totalLaps || seen.has(lapNumber)) {
      throw new StrategyManualInputError("lap_out_of_range", `lapCorrections.${index}.lapNumber`, "lap correction is outside the plan or duplicated");
    }
    seen.add(lapNumber);
    const row: Record<string, unknown> = { lapNumber };
    for (const field of LAP_FIELDS) {
      if (raw[field] !== undefined) row[field] = parseInputValue(raw[field], `lapCorrections.${index}.${field}`, FIELD_RULES[field]);
    }
    if (Object.keys(row).length === 1) {
      throw invalid(`lapCorrections.${index}`, "empty lap correction");
    }
    return row as StrategyLapCorrection;
  }).sort((left, right) => left.lapNumber - right.lapNumber);

  return freeze({ version: STRATEGY_MANUAL_INPUT_VERSION, quick, lapCorrections });
}

export function effectiveValue(value: StrategyInputValue): number {
  return value.correction?.value ?? value.original;
}

export function correctQuickValue<T extends StrategyManualDocument>(
  document: T,
  field: StrategyQuickField,
  value: number,
  reason: string,
  correctedAt: string,
): T {
  const totalLaps = plannedLaps(document);
  const current = parseStrategyManualInputs(document.manualInputs, totalLaps);
  const manualInputs = parseStrategyManualInputs({
    ...current,
    quick: {
      ...current.quick,
      [field]: withCorrection(current.quick[field], value, reason, correctedAt),
    },
  }, totalLaps);
  return freeze({ ...document, manualInputs }) as T;
}

export function clearQuickCorrection<T extends StrategyManualDocument>(
  document: T,
  field: StrategyQuickField,
): T {
  const totalLaps = plannedLaps(document);
  const current = parseStrategyManualInputs(document.manualInputs, totalLaps);
  if (!current.quick[field].correction) return document;
  const manualInputs = parseStrategyManualInputs({
    ...current,
    quick: {
      ...current.quick,
      [field]: { original: current.quick[field].original },
    },
  }, totalLaps);
  return freeze({ ...document, manualInputs }) as T;
}

export function correctLapValue<T extends StrategyManualDocument>(
  document: T,
  lapNumber: number,
  field: StrategyLapField,
  value: number,
  reason: string,
  correctedAt: string,
): T {
  const totalLaps = plannedLaps(document);
  const current = parseStrategyManualInputs(document.manualInputs, totalLaps);
  if (!Number.isSafeInteger(lapNumber) || lapNumber < 1 || lapNumber > totalLaps) {
    throw new StrategyManualInputError("lap_out_of_range", "lapNumber", "lap is outside the current plan");
  }
  const rows = effectiveLapRows({ ...document, manualInputs: current });
  const index = current.lapCorrections.findIndex((row) => row.lapNumber === lapNumber);
  const existing = index >= 0 ? current.lapCorrections[index] : { lapNumber };
  const source = existing[field] ?? input(rows[lapNumber - 1][field].value);
  const next = { ...existing, [field]: withCorrection(source, value, reason, correctedAt) };
  const lapCorrections = [...current.lapCorrections];
  if (index >= 0) lapCorrections[index] = next;
  else lapCorrections.push(next);
  const manualInputs = parseStrategyManualInputs({ ...current, lapCorrections }, totalLaps);
  return freeze({ ...document, manualInputs }) as T;
}

export function clearLapCorrection<T extends StrategyManualDocument>(
  document: T,
  lapNumber: number,
  field: StrategyLapField,
): T {
  const totalLaps = plannedLaps(document);
  const current = parseStrategyManualInputs(document.manualInputs, totalLaps);
  const row = current.lapCorrections.find((candidate) => candidate.lapNumber === lapNumber);
  if (!row?.[field]) return document;
  const next = { ...row };
  delete next[field];
  const lapCorrections = Object.keys(next).length === 1
    ? current.lapCorrections.filter((candidate) => candidate.lapNumber !== lapNumber)
    : current.lapCorrections.map((candidate) => candidate.lapNumber === lapNumber ? next : candidate);
  const manualInputs = parseStrategyManualInputs({ ...current, lapCorrections }, totalLaps);
  return freeze({ ...document, manualInputs }) as T;
}

export function effectiveLapRows(document: StrategyManualDocument): readonly StrategyEffectiveLapRow[] {
  const totalLaps = plannedLaps(document);
  const inputs = parseStrategyManualInputs(document.manualInputs, totalLaps);
  const byLap = new Map(inputs.lapCorrections.map((row) => [row.lapNumber, row]));
  return Array.from({ length: totalLaps }, (_, index) => {
    const lapNumber = index + 1;
    const correction = byLap.get(lapNumber);
    const row = { lapNumber } as Record<string, unknown>;
    for (const field of LAP_FIELDS) {
      const source = correction?.[field] ?? inputs.quick[field];
      row[field] = {
        original: source.original,
        value: effectiveValue(source),
        corrected: Boolean(source.correction),
        ...(source.correction?.reason ? { reason: source.correction.reason } : {}),
      };
    }
    return row as StrategyEffectiveLapRow;
  });
}

function parseInputValue(value: unknown, field: string, rule: FieldRule): StrategyInputValue {
  if (!isRecord(value)) throw invalid(field, "input value is required");
  validateNumber(value.original, `${field}.original`, rule);
  const output: { original: number; correction?: StrategyInputCorrection } = { original: Number(value.original) };
  if (value.correction !== undefined) {
    if (!isRecord(value.correction)) throw invalid(`${field}.correction`, "correction must be an object");
    validateNumber(value.correction.value, `${field}.correction.value`, rule);
    if (typeof value.correction.reason !== "string" || value.correction.reason.trim().length < 1 || value.correction.reason.length > 160) {
      throw invalid(`${field}.correction.reason`, "correction reason is required");
    }
    if (!canonicalTimestamp(value.correction.correctedAt)) {
      throw invalid(`${field}.correction.correctedAt`, "correction timestamp must be canonical UTC");
    }
    output.correction = {
      value: Number(value.correction.value),
      reason: value.correction.reason.trim(),
      correctedAt: value.correction.correctedAt,
    };
  }
  return output;
}

function withCorrection(source: StrategyInputValue, value: number, reason: string, correctedAt: string): StrategyInputValue {
  return { original: source.original, correction: { value, reason: reason.trim(), correctedAt } };
}

function validateNumber(value: unknown, field: string, rule: FieldRule) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < rule.min || value > rule.max || (rule.positive && value <= 0)) {
    throw invalid(field, `must be ${rule.positive ? "positive" : "non-negative"} and between ${rule.min} and ${rule.max}`);
  }
}

function plannedLaps(document: Pick<StrategyManualDocument, "stints">): number {
  const total = document.stints.reduce((sum, stint) => sum + stint.lapCount, 0);
  if (!Number.isSafeInteger(total) || total < 1) throw invalid("stints", "invalid planned lap total");
  return total;
}

function canonicalTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || !/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,3}))?Z$/.test(value)) return false;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return false;
  const iso = parsed.toISOString();
  const milliseconds = iso.slice(20, 23).replace(/0+$/, "");
  return `${iso.slice(0, 19)}${milliseconds ? `.${milliseconds}` : ""}Z` === value;
}

function input(original: number): StrategyInputValue {
  return { original };
}

function invalid(field: string, message: string) {
  return new StrategyManualInputError("invalid_manual_input", field, message);
}

function freeze<T>(value: T): T {
  const clone = structuredClone(value);
  deepFreeze(clone);
  return clone;
}

function deepFreeze(value: unknown): void {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
