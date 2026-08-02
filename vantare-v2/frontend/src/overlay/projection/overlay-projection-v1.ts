import type { ProjectionEnvelope } from "../../telemetry-transport/contracts";

// Authoritative Overlay Projection v1 decoder shared by every runtime.

export const OVERLAY_PROJECTION_MAX_VEHICLES = 104;
export const OVERLAY_PROJECTION_MAX_CONTROL_SAMPLES = 120;
export const OVERLAY_PROJECTION_MAX_DELTA_SAMPLES = 120;

const CAPABILITIES = [
  "session",
  "standings",
  "controls",
  "controls.history",
  "pit",
] as const;
const PROVENANCE = ["unknown", "observed", "derived", "estimated"] as const;
const FRESHNESS = ["missing", "fresh", "stale", "invalid"] as const;
const SESSION_TYPES = [
  "practice",
  "qualifying",
  "race",
  "warmup",
  "endurance",
] as const;
const DELTA_REFERENCES = ["best-completed-player-lap"] as const;

export type OverlayCapability = (typeof CAPABILITIES)[number];
export type OverlayProvenance = (typeof PROVENANCE)[number];
export type OverlayFreshness = (typeof FRESHNESS)[number];
export type OverlaySessionType = (typeof SESSION_TYPES)[number];
export type OverlayDeltaReference = (typeof DELTA_REFERENCES)[number];

export type OverlayProjectionPresentField<T> = Readonly<{
  present: true;
  value: T;
  provenance: OverlayProvenance;
  freshness: Exclude<OverlayFreshness, "missing">;
}>;

export type OverlayProjectionAbsentField = Readonly<{
  present: false;
  value: unknown;
  provenance: OverlayProvenance;
  freshness: "missing";
}>;

export type OverlayProjectionField<T> =
  | OverlayProjectionPresentField<T>
  | OverlayProjectionAbsentField;

export type OverlayVehicleV1 = Readonly<{
  id: string;
  name: OverlayProjectionField<string>;
  lapNumber: OverlayProjectionField<number>;
  gear: OverlayProjectionField<number>;
  engineRpm: OverlayProjectionField<number>;
  speedMps: OverlayProjectionField<number>;
  throttle: OverlayProjectionField<number>;
  brake: OverlayProjectionField<number>;
  clutch: OverlayProjectionField<number>;
  position: OverlayProjectionField<number>;
  completedLaps: OverlayProjectionField<number>;
  inPit: OverlayProjectionField<boolean>;
  pitStopCount: OverlayProjectionField<number>;
  driverName: OverlayProjectionField<string>;
  vehicleClass: OverlayProjectionField<string>;
  sector: OverlayProjectionField<number>;
  lapDistanceMeters: OverlayProjectionField<number>;
  bestLapSeconds: OverlayProjectionField<number>;
  lastLapSeconds: OverlayProjectionField<number>;
  estimatedLapSeconds: OverlayProjectionField<number>;
  penaltyCount: OverlayProjectionField<number>;
  timeBehindLeaderSeconds: OverlayProjectionField<number>;
  lapsBehindLeader: OverlayProjectionField<number>;
  timeBehindNextSeconds: OverlayProjectionField<number>;
  lapsBehindNext: OverlayProjectionField<number>;
  fuelLiters: OverlayProjectionField<number>;
  fuelCapacityLiters: OverlayProjectionField<number>;
  relativeTimeGapSeconds: OverlayProjectionField<number>;
  relativeLapDelta: OverlayProjectionField<number>;
}>;

export type OverlayControlSampleV1 = Readonly<{
  epoch: number;
  sequence: number;
  vehicleId: string;
  throttle: number;
  brake: number;
  clutch: number;
}>;

export type OverlayControlHistoryV1 = Readonly<{
  present: boolean;
  provenance: OverlayProvenance;
  freshness: OverlayFreshness;
  samples: readonly OverlayControlSampleV1[];
}>;

export type OverlayDeltaSampleV1 = Readonly<{
  epoch: number;
  sequence: number;
  capturedAt: number;
  sourceTimeSeconds: number;
  lapDistanceMeters: number;
  deltaSeconds: number;
}>;

export type OverlayDeltaHistoryV1 = Readonly<{
  present: boolean;
  provenance: OverlayProvenance;
  freshness: OverlayFreshness;
  samples: readonly OverlayDeltaSampleV1[];
}>;

export type OverlayPayloadV1 = Readonly<{
  capabilities: readonly OverlayCapability[];
  trackName: OverlayProjectionField<string>;
  sessionType: OverlayProjectionField<OverlaySessionType>;
  playerVehicleId: string;
  vehicles: readonly OverlayVehicleV1[];
  controlsHistory: OverlayControlHistoryV1;
  endTimeSeconds: OverlayProjectionField<number>;
  remainingSeconds: OverlayProjectionField<number>;
  maximumLaps: OverlayProjectionField<number>;
  playerDeltaSeconds: OverlayProjectionField<number>;
  playerDeltaReference: OverlayProjectionField<OverlayDeltaReference>;
  deltaHistory: OverlayDeltaHistoryV1;
}>;

export type OverlayProjectionV1 = Readonly<{
  product: "overlay";
  projectionVersion: 1;
  epoch: number;
  sequence: number;
  capturedAt: string;
  statusRevision: number;
  payload: OverlayPayloadV1;
}>;

export type OverlayProjectionDecodeErrorCode =
  | "wrong-product"
  | "unsupported-version"
  | "full-snapshot-required"
  | "invalid-overlay-payload";

export class OverlayProjectionDecodeError extends Error {
  readonly code: OverlayProjectionDecodeErrorCode;

  constructor(code: OverlayProjectionDecodeErrorCode) {
    super(code);
    this.name = "OverlayProjectionDecodeError";
    this.code = code;
  }
}

/**
 * Decodes an already transport-validated full Overlay envelope. The decoder
 * still validates its product schema because transport deliberately treats the
 * payload as opaque JSON.
 */
export function decodeOverlayProjectionV1(
  envelope: ProjectionEnvelope,
): OverlayProjectionV1 {
  if (envelope.product !== "overlay") {
    throw new OverlayProjectionDecodeError("wrong-product");
  }
  if (envelope.projectionVersion !== 1) {
    throw new OverlayProjectionDecodeError("unsupported-version");
  }
  if (envelope.kind !== "full") {
    throw new OverlayProjectionDecodeError("full-snapshot-required");
  }

  const payload = requireObject(envelope.payload);
  requireKeys(payload, [
    "capabilities",
    "trackName",
    "sessionType",
    "playerVehicleId",
    "vehicles",
    "controlsHistory",
  ]);

  return deepFreeze({
    product: "overlay",
    projectionVersion: 1,
    epoch: requirePositiveSafeInteger(envelope.epoch),
    sequence: requirePositiveSafeInteger(envelope.sequence),
    capturedAt: envelope.capturedAt,
    statusRevision: requirePositiveSafeInteger(envelope.statusRevision),
    payload: {
      capabilities: decodeCapabilities(payload.capabilities),
      trackName: decodeField(payload.trackName, requireString),
      sessionType: decodeField(payload.sessionType, requireSessionType),
      playerVehicleId: requireString(payload.playerVehicleId),
      vehicles: decodeVehicles(payload.vehicles),
      controlsHistory: decodeHistory(payload.controlsHistory),
      endTimeSeconds: decodeOptionalField(
        payload,
        "endTimeSeconds",
        requireNonNegativeFiniteNumber,
        0,
      ),
      remainingSeconds: decodeOptionalField(
        payload,
        "remainingSeconds",
        requireNonNegativeFiniteNumber,
        0,
      ),
      maximumLaps: decodeOptionalField(
        payload,
        "maximumLaps",
        requireNonNegativeSafeInteger,
        0,
      ),
      playerDeltaSeconds: decodeOptionalField(
        payload,
        "playerDeltaSeconds",
        requireFiniteNumber,
        0,
      ),
      playerDeltaReference: decodeOptionalField(
        payload,
        "playerDeltaReference",
        requireDeltaReference,
        "best-completed-player-lap",
      ),
      deltaHistory: Object.hasOwn(payload, "deltaHistory")
        ? decodeDeltaHistory(payload.deltaHistory)
        : missingHistory(),
    },
  });
}

function decodeCapabilities(value: unknown): OverlayCapability[] {
  const entries = requireArray(value, CAPABILITIES.length);
  const seen = new Set<OverlayCapability>();
  return entries.map((entry) => {
    const capability = requireEnum(entry, CAPABILITIES);
    if (seen.has(capability)) {
      invalid();
    }
    seen.add(capability);
    return capability;
  });
}

function decodeVehicles(value: unknown): OverlayVehicleV1[] {
  const entries = requireArray(value, OVERLAY_PROJECTION_MAX_VEHICLES);
  const ids = new Set<string>();
  return entries.map((entry) => {
    const object = requireObject(entry);
    requireKeys(object, [
      "id",
      "name",
      "lapNumber",
      "gear",
      "engineRpm",
      "speedMps",
      "throttle",
      "brake",
      "clutch",
      "position",
      "completedLaps",
      "inPit",
      "pitStopCount",
    ]);
    const id = requireNonEmptyID(object.id);
    if (ids.has(id)) {
      invalid();
    }
    ids.add(id);
    return {
      id,
      name: decodeField(object.name, requireString),
      lapNumber: decodeField(object.lapNumber, requireNonNegativeSafeInteger),
      gear: decodeField(object.gear, requireSafeInteger),
      engineRpm: decodeField(object.engineRpm, requireNonNegativeFiniteNumber),
      speedMps: decodeField(object.speedMps, requireNonNegativeFiniteNumber),
      throttle: decodeField(object.throttle, requireRatio),
      brake: decodeField(object.brake, requireRatio),
      clutch: decodeField(object.clutch, requireRatio),
      position: decodeField(object.position, requireNonNegativeSafeInteger),
      completedLaps: decodeField(
        object.completedLaps,
        requireNonNegativeSafeInteger,
      ),
      inPit: decodeField(object.inPit, requireBoolean),
      pitStopCount: decodeField(
        object.pitStopCount,
        requireNonNegativeSafeInteger,
      ),
      driverName: decodeOptionalField(object, "driverName", requireString, ""),
      vehicleClass: decodeOptionalField(
        object,
        "vehicleClass",
        requireString,
        "",
      ),
      sector: decodeOptionalField(
        object,
        "sector",
        requireKnownSector,
        0,
      ),
      lapDistanceMeters: decodeOptionalField(
        object,
        "lapDistanceMeters",
        requireNonNegativeFiniteNumber,
        0,
      ),
      bestLapSeconds: decodeOptionalField(
        object,
        "bestLapSeconds",
        requireNonNegativeFiniteNumber,
        0,
      ),
      lastLapSeconds: decodeOptionalField(
        object,
        "lastLapSeconds",
        requireNonNegativeFiniteNumber,
        0,
      ),
      estimatedLapSeconds: decodeOptionalField(
        object,
        "estimatedLapSeconds",
        requireNonNegativeFiniteNumber,
        0,
      ),
      penaltyCount: decodeOptionalField(
        object,
        "penaltyCount",
        requireNonNegativeSafeInteger,
        0,
      ),
      timeBehindLeaderSeconds: decodeOptionalField(
        object,
        "timeBehindLeaderSeconds",
        requireNonNegativeFiniteNumber,
        0,
      ),
      lapsBehindLeader: decodeOptionalField(
        object,
        "lapsBehindLeader",
        requireNonNegativeSafeInteger,
        0,
      ),
      timeBehindNextSeconds: decodeOptionalField(
        object,
        "timeBehindNextSeconds",
        requireNonNegativeFiniteNumber,
        0,
      ),
      lapsBehindNext: decodeOptionalField(
        object,
        "lapsBehindNext",
        requireNonNegativeSafeInteger,
        0,
      ),
      fuelLiters: decodeOptionalField(
        object,
        "fuelLiters",
        requireNonNegativeFiniteNumber,
        0,
      ),
      fuelCapacityLiters: decodeOptionalField(
        object,
        "fuelCapacityLiters",
        requireNonNegativeFiniteNumber,
        0,
      ),
      relativeTimeGapSeconds: decodeOptionalField(
        object,
        "relativeTimeGapSeconds",
        requireFiniteNumber,
        0,
      ),
      relativeLapDelta: decodeOptionalField(
        object,
        "relativeLapDelta",
        requireSafeInteger,
        0,
      ),
    };
  });
}

function decodeOptionalField<T>(
  object: Record<string, unknown>,
  key: string,
  decodeValue: (input: unknown) => T,
  missingValue: T,
): OverlayProjectionField<T> {
  return Object.hasOwn(object, key)
    ? decodeField(object[key], decodeValue)
    : missingField(missingValue);
}

function missingField<T>(value: T): OverlayProjectionField<T> {
  return {
    present: false,
    value,
    provenance: "unknown",
    freshness: "missing",
  };
}

function decodeHistory(value: unknown): OverlayControlHistoryV1 {
  const object = requireObject(value);
  requireKeys(object, ["present", "provenance", "freshness", "samples"]);
  const present = requireBoolean(object.present);
  const samples = requireArray(
    object.samples,
    OVERLAY_PROJECTION_MAX_CONTROL_SAMPLES,
  ).map((entry) => {
    const sample = requireObject(entry);
    requireKeys(sample, [
      "epoch",
      "sequence",
      "vehicleId",
      "throttle",
      "brake",
      "clutch",
    ]);
    return {
      epoch: requirePositiveSafeInteger(sample.epoch),
      sequence: requirePositiveSafeInteger(sample.sequence),
      vehicleId: requireNonEmptyID(sample.vehicleId),
      throttle: requireRatio(sample.throttle),
      brake: requireRatio(sample.brake),
      clutch: requireRatio(sample.clutch),
    };
  });
  if (present !== (samples.length > 0)) {
    invalid();
  }
  return {
    present,
    provenance: requireEnum(object.provenance, PROVENANCE),
    freshness: requireEnum(object.freshness, FRESHNESS),
    samples,
  };
}

function decodeDeltaHistory(value: unknown): OverlayDeltaHistoryV1 {
  const object = requireObject(value);
  requireKeys(object, ["present", "provenance", "freshness", "samples"]);
  const present = requireBoolean(object.present);
  const freshness = requireEnum(object.freshness, FRESHNESS);
  const samples = requireArray(
    object.samples,
    OVERLAY_PROJECTION_MAX_DELTA_SAMPLES,
  ).map((entry) => {
    const sample = requireObject(entry);
    requireKeys(sample, [
      "epoch",
      "sequence",
      "capturedAt",
      "sourceTimeSeconds",
      "lapDistanceMeters",
      "deltaSeconds",
    ]);
    return {
      epoch: requirePositiveSafeInteger(sample.epoch),
      sequence: requirePositiveSafeInteger(sample.sequence),
      capturedAt: requireNonNegativeSafeInteger(sample.capturedAt),
      sourceTimeSeconds: requireNonNegativeFiniteNumber(
        sample.sourceTimeSeconds,
      ),
      lapDistanceMeters: requireNonNegativeFiniteNumber(
        sample.lapDistanceMeters,
      ),
      deltaSeconds: requireFiniteNumber(sample.deltaSeconds),
    };
  });
  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1]!;
    const current = samples[index]!;
    if (
      current.epoch !== previous.epoch ||
      current.sequence <= previous.sequence ||
      current.capturedAt < previous.capturedAt ||
      current.sourceTimeSeconds < previous.sourceTimeSeconds
    ) {
      invalid();
    }
  }
  if (present !== (samples.length > 0)) {
    invalid();
  }
  return {
    present,
    provenance: requireEnum(object.provenance, PROVENANCE),
    freshness,
    samples,
  };
}

function missingHistory(): OverlayDeltaHistoryV1 {
  return {
    present: false,
    provenance: "unknown",
    freshness: "missing",
    samples: [],
  };
}

function decodeField<T>(
  value: unknown,
  decodeValue: (input: unknown) => T,
): OverlayProjectionField<T> {
  const object = requireObject(value);
  requireKeys(object, ["present", "value", "provenance", "freshness"]);
  const present = requireBoolean(object.present);
  const freshness = requireEnum(object.freshness, FRESHNESS);
  validatePresenceFreshness(present, freshness);
  const provenance = requireEnum(object.provenance, PROVENANCE);
  if (!present) {
    return {
      present: false,
      value: cloneTransportValue(object.value),
      provenance,
      freshness: "missing",
    };
  }
  if (freshness === "missing") {
    invalid();
  }
  return {
    present: true,
    value: decodeValue(object.value),
    provenance,
    freshness,
  };
}

function validatePresenceFreshness(
  present: boolean,
  freshness: OverlayFreshness,
): void {
  if (
    (present && freshness === "missing") ||
    (!present && freshness !== "missing")
  ) {
    invalid();
  }
}

function requireObject(value: unknown): Record<string, unknown> {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    invalid();
  }
  return value as Record<string, unknown>;
}

function requireKeys(
  object: Record<string, unknown>,
  keys: readonly string[],
): void {
  if (keys.some((key) => !Object.hasOwn(object, key))) {
    invalid();
  }
}

function requireArray(value: unknown, maximum: number): unknown[] {
  if (!Array.isArray(value) || value.length > maximum) {
    invalid();
  }
  return value;
}

function requireString(value: unknown): string {
  if (typeof value !== "string") {
    invalid();
  }
  return value;
}

function requireNonEmptyID(value: unknown): string {
  const id = requireString(value);
  if (id.trim().length === 0) {
    invalid();
  }
  return id;
}

function requireBoolean(value: unknown): boolean {
  if (typeof value !== "boolean") {
    invalid();
  }
  return value;
}

function requireSafeInteger(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    invalid();
  }
  return value;
}

function requirePositiveSafeInteger(value: unknown): number {
  const number = requireSafeInteger(value);
  if (number <= 0) {
    invalid();
  }
  return number;
}

function requireNonNegativeSafeInteger(value: unknown): number {
  const number = requireSafeInteger(value);
  if (number < 0) {
    invalid();
  }
  return number;
}

function requireKnownSector(value: unknown): number {
  const sector = requireSafeInteger(value);
  if (sector < 1 || sector > 3) {
    invalid();
  }
  return sector;
}

function requireNonNegativeFiniteNumber(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    invalid();
  }
  return value;
}

function requireFiniteNumber(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    invalid();
  }
  return value;
}

function requireRatio(value: unknown): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 1
  ) {
    invalid();
  }
  return value;
}

function requireSessionType(value: unknown): OverlaySessionType {
  return requireEnum(value, SESSION_TYPES);
}

function requireDeltaReference(value: unknown): OverlayDeltaReference {
  return requireEnum(value, DELTA_REFERENCES);
}

function requireEnum<const Values extends readonly string[]>(
  value: unknown,
  allowed: Values,
): Values[number] {
  if (typeof value !== "string" || !allowed.includes(value)) {
    invalid();
  }
  return value as Values[number];
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value)) {
    deepFreeze(child);
  }
  return Object.freeze(value);
}

function cloneTransportValue(value: unknown): unknown {
  if (value === undefined) {
    invalid();
  }
  return structuredClone(value);
}

function invalid(): never {
  throw new OverlayProjectionDecodeError("invalid-overlay-payload");
}
