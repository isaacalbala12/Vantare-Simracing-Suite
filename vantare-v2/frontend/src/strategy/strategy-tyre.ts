/**
 * TypeScript mirror of `internal/strategy/tyres`. That Go package is the
 * authority for what a physical tyre is and which placements are legal; this
 * module exists so the editor stores and reads the *same* shape rather than a
 * simplified parallel model that can drift away from it.
 *
 * Field names match the Go struct tags exactly, so a document round-trips to
 * the domain without a translation layer in between.
 *
 * The rules reproduced here are the subset the editor needs to reject an
 * illegal plan locally. Anything beyond that stays in Go.
 */

export const STRATEGY_CORNERS = [
  "front_left",
  "front_right",
  "rear_left",
  "rear_right",
] as const;

export type StrategyCorner = (typeof STRATEGY_CORNERS)[number];

export const STRATEGY_COMPOUNDS = ["soft", "medium", "hard", "wet"] as const;
export type StrategyCompound = (typeof STRATEGY_COMPOUNDS)[number];

export const STRATEGY_TYRE_ORIGINS = ["event_allocation", "qualifying", "unknown"] as const;
export type StrategyTyreOrigin = (typeof STRATEGY_TYRE_ORIGINS)[number];

export const STRATEGY_TYRE_STATES = ["free", "mounted", "used", "discarded"] as const;
export type StrategyTyreState = (typeof STRATEGY_TYRE_STATES)[number];

export const STRATEGY_PROVENANCE_KINDS = [
  "unknown",
  "observed",
  "corrected",
  "manual",
  "derived",
  "estimated",
  "range",
] as const;
export type StrategyProvenanceKind = (typeof STRATEGY_PROVENANCE_KINDS)[number];

export const STRATEGY_CONFIDENCE_LEVELS = ["unknown", "low", "medium", "high"] as const;
export type StrategyConfidenceLevel = (typeof STRATEGY_CONFIDENCE_LEVELS)[number];

export type StrategyProvenance = {
  readonly kind: StrategyProvenanceKind;
  readonly sourceId?: string;
};

export type StrategyConfidence = {
  readonly level: StrategyConfidenceLevel;
  readonly basis?: string;
};

/**
 * Remaining usable tyre percentage. A range stays a range: an estimate is never
 * silently collapsed into an exact figure, which is why the editor cannot show
 * "78%" for a tyre nobody measured.
 */
export type StrategyTyreCondition = {
  readonly minimumRemainingPercent: number;
  readonly maximumRemainingPercent: number;
  readonly provenance: StrategyProvenance;
  readonly confidence: StrategyConfidence;
};

/**
 * One physical tyre. `lockedCorner` becomes permanent once the tyre has run;
 * `mountedCorner` is only the current, reversible placement.
 */
export type StrategyTyre = {
  readonly id: string;
  readonly compound: StrategyCompound;
  readonly origin: StrategyTyreOrigin;
  readonly condition: StrategyTyreCondition;
  readonly state: StrategyTyreState;
  readonly stints: number;
  readonly mountedCorner?: StrategyCorner;
  readonly lockedCorner?: StrategyCorner;
};

export type StrategyTyreErrorCode =
  | "invalid_tyre"
  | "invalid_compound"
  | "invalid_origin"
  | "invalid_condition"
  | "invalid_state"
  | "invalid_corner"
  | "corner_locked"
  | "tyre_discarded";

export class StrategyTyreError extends Error {
  readonly code: StrategyTyreErrorCode;
  readonly tyreId: string;

  constructor(code: StrategyTyreErrorCode, tyreId: string, message: string) {
    super(message);
    this.name = "StrategyTyreError";
    this.code = code;
    this.tyreId = tyreId;
  }
}

const TYRE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

/** Mirrors `tyres.DefaultCondition`: only documented product ranges. */
export function defaultTyreCondition(origin: StrategyTyreOrigin): StrategyTyreCondition {
  switch (origin) {
    case "event_allocation":
      return {
        minimumRemainingPercent: 100,
        maximumRemainingPercent: 100,
        provenance: { kind: "observed", sourceId: "event-allocation" },
        confidence: { level: "high", basis: "new event allocation" },
      };
    case "qualifying":
      return {
        minimumRemainingPercent: 80,
        maximumRemainingPercent: 90,
        provenance: { kind: "range", sourceId: "qualifying-default-range" },
        confidence: { level: "low", basis: "qualifying usage without exact data" },
      };
    case "unknown":
      return {
        minimumRemainingPercent: 40,
        maximumRemainingPercent: 70,
        provenance: { kind: "range", sourceId: "missing-data-default-range" },
        confidence: { level: "low", basis: "no measured or manual condition" },
      };
  }
}

export function isConditionExact(condition: StrategyTyreCondition): boolean {
  return condition.minimumRemainingPercent === condition.maximumRemainingPercent;
}

/** "100 %" when measured, "80–90 %" when it is genuinely a range. */
export function formatCondition(condition: StrategyTyreCondition): string {
  const minimum = trimNumber(condition.minimumRemainingPercent);
  if (isConditionExact(condition)) {
    return `${minimum} %`;
  }
  return `${minimum}–${trimNumber(condition.maximumRemainingPercent)} %`;
}

/** Midpoint, for bar widths only. Never present this as a measurement. */
export function conditionMidpoint(condition: StrategyTyreCondition): number {
  return (condition.minimumRemainingPercent + condition.maximumRemainingPercent) / 2;
}

export function cornerLabel(corner: StrategyCorner): string {
  return { front_left: "FL", front_right: "FR", rear_left: "RL", rear_right: "RR" }[corner];
}

/**
 * Whether the tyre may be planned on this corner. Planning is not mounting:
 * assigning a fresh tyre to a corner does not lock it, matching the Go domain
 * where only recorded use (`RecordUse`) makes a corner permanent.
 */
export function assertPlannable(tyre: StrategyTyre, corner: StrategyCorner): void {
  if (tyre.state === "discarded") {
    throw new StrategyTyreError("tyre_discarded", tyre.id, `${tyre.id} está descartado.`);
  }
  if (tyre.lockedCorner && tyre.lockedCorner !== corner) {
    throw new StrategyTyreError(
      "corner_locked",
      tyre.id,
      `${tyre.id} está ligado a ${cornerLabel(tyre.lockedCorner)}.`,
    );
  }
}

export function parseStrategyTyre(value: unknown): StrategyTyre {
  if (!isRecord(value)) {
    throw new StrategyTyreError("invalid_tyre", "", "el neumático no es un objeto");
  }
  const id = value.id;
  if (typeof id !== "string" || !TYRE_ID_PATTERN.test(id)) {
    throw new StrategyTyreError("invalid_tyre", "", "identificador de neumático inválido");
  }
  if (!isCompound(value.compound)) {
    throw new StrategyTyreError("invalid_compound", id, `compuesto inválido en ${id}`);
  }

  const legacy = migrateLegacyTyre(value, id);
  const source = legacy ?? value;

  if (!isOrigin(source.origin)) {
    throw new StrategyTyreError("invalid_origin", id, `origen inválido en ${id}`);
  }
  const condition = parseCondition(source.condition, id);
  if (!isState(source.state)) {
    throw new StrategyTyreError("invalid_state", id, `estado inválido en ${id}`);
  }
  const stints = source.stints;
  if (!Number.isSafeInteger(stints) || Number(stints) < 0) {
    throw new StrategyTyreError("invalid_tyre", id, `número de stints inválido en ${id}`);
  }
  if (source.mountedCorner !== undefined && !isCorner(source.mountedCorner)) {
    throw new StrategyTyreError("invalid_corner", id, `esquina montada inválida en ${id}`);
  }
  if (source.lockedCorner !== undefined && !isCorner(source.lockedCorner)) {
    throw new StrategyTyreError("invalid_corner", id, `esquina bloqueada inválida en ${id}`);
  }

  const tyre: StrategyTyre = {
    id,
    compound: value.compound,
    origin: source.origin,
    condition,
    state: source.state,
    stints: Number(stints),
    ...(source.mountedCorner ? { mountedCorner: source.mountedCorner as StrategyCorner } : {}),
    ...(source.lockedCorner ? { lockedCorner: source.lockedCorner as StrategyCorner } : {}),
  };
  assertStateInvariants(tyre);
  return tyre;
}

/** Mirrors the state invariants in `tyres.Tyre.validate`. */
function assertStateInvariants(tyre: StrategyTyre): void {
  const fail = (message: string) => {
    throw new StrategyTyreError("invalid_state", tyre.id, message);
  };
  switch (tyre.state) {
    case "free":
      if (tyre.stints !== 0 || tyre.mountedCorner || tyre.lockedCorner) {
        fail(`${tyre.id} está libre pero conserva historial de uso o esquina`);
      }
      return;
    case "mounted":
      if (!tyre.mountedCorner) fail(`${tyre.id} está montado sin esquina actual`);
      if (tyre.stints === 0 && tyre.lockedCorner) {
        fail(`${tyre.id} no ha rodado y no puede tener esquina bloqueada`);
      }
      if (tyre.stints > 0 && tyre.lockedCorner !== tyre.mountedCorner) {
        fail(`${tyre.id} ya rodó y debe permanecer en su esquina bloqueada`);
      }
      return;
    case "used":
      if (tyre.stints === 0 || !tyre.lockedCorner || tyre.mountedCorner) {
        fail(`${tyre.id} usado requiere historial de stints y una única esquina bloqueada`);
      }
      return;
    case "discarded":
      if (tyre.mountedCorner) fail(`${tyre.id} descartado no puede seguir montado`);
      if (tyre.stints === 0 && tyre.lockedCorner) {
        fail(`${tyre.id} descartado sin uso no puede tener esquina bloqueada`);
      }
      if (tyre.stints > 0 && !tyre.lockedCorner) {
        fail(`${tyre.id} descartado tras rodar conserva su esquina bloqueada`);
      }
  }
}

function parseCondition(value: unknown, tyreId: string): StrategyTyreCondition {
  if (!isRecord(value)) {
    throw new StrategyTyreError("invalid_condition", tyreId, `condición ausente en ${tyreId}`);
  }
  const minimum = value.minimumRemainingPercent;
  const maximum = value.maximumRemainingPercent;
  if (typeof minimum !== "number" || typeof maximum !== "number"
    || !Number.isFinite(minimum) || !Number.isFinite(maximum)) {
    throw new StrategyTyreError("invalid_condition", tyreId, `porcentaje no finito en ${tyreId}`);
  }
  if (minimum < 0 || maximum > 100 || minimum > maximum) {
    throw new StrategyTyreError(
      "invalid_condition",
      tyreId,
      `el porcentaje debe cumplir 0 <= mínimo <= máximo <= 100 en ${tyreId}`,
    );
  }
  const provenance = parseProvenance(value.provenance, tyreId);
  const confidence = parseConfidence(value.confidence, tyreId);
  const exact = minimum === maximum;
  if (exact && !["observed", "corrected", "manual", "derived"].includes(provenance.kind)) {
    throw new StrategyTyreError(
      "invalid_condition",
      tyreId,
      `un porcentaje exacto exige evidencia observada, corregida, manual o derivada en ${tyreId}`,
    );
  }
  if (!exact && provenance.kind !== "range" && provenance.kind !== "estimated") {
    throw new StrategyTyreError(
      "invalid_condition",
      tyreId,
      `un rango exige procedencia de rango o estimada en ${tyreId}`,
    );
  }
  return { minimumRemainingPercent: minimum, maximumRemainingPercent: maximum, provenance, confidence };
}

function parseProvenance(value: unknown, tyreId: string): StrategyProvenance {
  if (!isRecord(value) || !isProvenanceKind(value.kind)) {
    throw new StrategyTyreError("invalid_condition", tyreId, `procedencia inválida en ${tyreId}`);
  }
  const sourceId = typeof value.sourceId === "string" ? value.sourceId.trim() : "";
  if (value.kind === "unknown") {
    if (sourceId !== "") {
      throw new StrategyTyreError("invalid_condition", tyreId, `una procedencia desconocida no lleva origen en ${tyreId}`);
    }
    return { kind: "unknown" };
  }
  if (sourceId === "") {
    throw new StrategyTyreError("invalid_condition", tyreId, `la procedencia exige un origen en ${tyreId}`);
  }
  return { kind: value.kind, sourceId };
}

function parseConfidence(value: unknown, tyreId: string): StrategyConfidence {
  if (!isRecord(value) || !isConfidenceLevel(value.level)) {
    throw new StrategyTyreError("invalid_condition", tyreId, `confianza inválida en ${tyreId}`);
  }
  const basis = typeof value.basis === "string" ? value.basis.trim() : "";
  if (value.level === "unknown") {
    if (basis !== "") {
      throw new StrategyTyreError("invalid_condition", tyreId, `una confianza desconocida no lleva base en ${tyreId}`);
    }
    return { level: "unknown" };
  }
  if (basis === "") {
    throw new StrategyTyreError("invalid_condition", tyreId, `la confianza exige una base en ${tyreId}`);
  }
  return { level: value.level, basis };
}

/**
 * Documents saved before the models were unified carry a bare
 * `remainingPercent`. It is preserved as an exact manual value — a stored
 * figure a person put there — rather than being reinterpreted as a measurement.
 */
function migrateLegacyTyre(value: Record<string, unknown>, id: string): Record<string, unknown> | null {
  if (value.condition !== undefined || typeof value.remainingPercent !== "number") {
    return null;
  }
  const percent = value.remainingPercent;
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
    throw new StrategyTyreError("invalid_condition", id, `porcentaje heredado inválido en ${id}`);
  }
  const locked = isCorner(value.lockedCorner) ? value.lockedCorner : undefined;
  return {
    origin: "unknown",
    condition: {
      minimumRemainingPercent: percent,
      maximumRemainingPercent: percent,
      provenance: { kind: "manual", sourceId: "legacy-editor-document" },
      confidence: { level: "low", basis: "migrado de un documento anterior a la unificación" },
    },
    state: locked ? "used" : "free",
    stints: locked ? 1 : 0,
    ...(locked ? { lockedCorner: locked } : {}),
  };
}

function trimNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCompound(value: unknown): value is StrategyCompound {
  return typeof value === "string" && (STRATEGY_COMPOUNDS as readonly string[]).includes(value);
}

function isOrigin(value: unknown): value is StrategyTyreOrigin {
  return typeof value === "string" && (STRATEGY_TYRE_ORIGINS as readonly string[]).includes(value);
}

function isState(value: unknown): value is StrategyTyreState {
  return typeof value === "string" && (STRATEGY_TYRE_STATES as readonly string[]).includes(value);
}

function isCorner(value: unknown): value is StrategyCorner {
  return typeof value === "string" && (STRATEGY_CORNERS as readonly string[]).includes(value);
}

function isProvenanceKind(value: unknown): value is StrategyProvenanceKind {
  return typeof value === "string" && (STRATEGY_PROVENANCE_KINDS as readonly string[]).includes(value);
}

function isConfidenceLevel(value: unknown): value is StrategyConfidenceLevel {
  return typeof value === "string" && (STRATEGY_CONFIDENCE_LEVELS as readonly string[]).includes(value);
}
