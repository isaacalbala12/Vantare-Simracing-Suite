export const TELEMETRY_PRODUCTS = [
  "overlay",
  "engineer",
  "strategy",
  "analysis",
] as const;

export type ProductID = (typeof TELEMETRY_PRODUCTS)[number];
export type SnapshotKind = "full" | "delta";
export type EventKind = "projection" | "status" | "fact";
export type JSONValue =
  | null
  | boolean
  | number
  | string
  | JSONValue[]
  | { [key: string]: JSONValue };
export type JSONObject = { [key: string]: JSONValue };

export const MAX_PAYLOAD_BYTES = 256 * 1024;
export const PROJECTION_VERSION = 1;

export const TELEMETRY_STATUS_STATES = [
  "stopped",
  "detecting",
  "connecting",
  "live",
  "degraded",
  "stale",
  "error",
  "stopping",
] as const;

export type StatusState = (typeof TELEMETRY_STATUS_STATES)[number];

export type ProjectionEnvelope = {
  product: ProductID;
  projectionVersion: number;
  epoch: number;
  sequence: number;
  kind: SnapshotKind;
  capturedAt: string;
  statusRevision: number;
  payload: JSONObject;
};

export type StatusEnvelope = {
  product: ProductID;
  statusRevision: number;
  capturedAt: string;
  payload: {
    state: StatusState;
    reconnectAttempt: number;
  };
};

export type FactEnvelope = {
  product: ProductID;
  projectionVersion: number;
  epoch: number;
  sequence: number;
  factSequence: number;
  capturedAt: string;
  statusRevision: number;
  payload: JSONObject;
};

export type TransportEvent =
  | { kind: "projection"; value: ProjectionEnvelope }
  | { kind: "status"; value: StatusEnvelope }
  | { kind: "fact"; value: FactEnvelope };

export type TransportErrorCode =
  | "event-name"
  | "invalid-json"
  | "invalid-envelope"
  | "payload-too-large"
  | "forbidden-payload"
  | "unsupported-version";

export class TransportContractError extends Error {
  readonly code: TransportErrorCode;

  constructor(code: TransportErrorCode) {
    super(code);
    this.name = "TransportContractError";
    this.code = code;
  }
}

export function eventName(product: ProductID, kind: EventKind): string {
  return `telemetry:${product}:${kind}`;
}

export function projectionRoute(product: ProductID): string {
  return `/telemetry/${product}/projection`;
}

export function factsRoute(product: ProductID): string {
  return `/telemetry/${product}/facts`;
}

export function decodeTransportEvent(
  name: string,
  input: unknown,
  maximumPayloadBytes = MAX_PAYLOAD_BYTES,
): TransportEvent {
  const parsedName = parseEventName(name);
  const value = parseInput(input);
  const maximum = effectiveMaximum(maximumPayloadBytes);
  if (parsedName.kind === "projection") {
    return {
      kind: "projection",
      value: decodeProjection(parsedName.product, value, maximum),
    };
  }
  if (parsedName.kind === "status") {
    return {
      kind: "status",
      value: decodeStatus(parsedName.product, value, maximum),
    };
  }
  return {
    kind: "fact",
    value: decodeFact(parsedName.product, value, maximum),
  };
}

function parseEventName(name: string): {
  product: ProductID;
  kind: EventKind;
} {
  const match = /^telemetry:(overlay|engineer|strategy|analysis):(projection|status|fact)$/.exec(
    name,
  );
  if (!match) {
    throw new TransportContractError("event-name");
  }
  return { product: match[1] as ProductID, kind: match[2] as EventKind };
}

function parseInput(input: unknown): unknown {
  if (typeof input !== "string") {
    return input;
  }
  try {
    return JSON.parse(input) as unknown;
  } catch {
    throw new TransportContractError("invalid-json");
  }
}

function decodeProjection(
  product: ProductID,
  value: unknown,
  maximumPayloadBytes: number,
): ProjectionEnvelope {
  const object = requireObject(value);
  const keys = [
    "product",
    "projectionVersion",
    "epoch",
    "sequence",
    "kind",
    "capturedAt",
    "statusRevision",
    "payload",
  ] as const;
  requireFields(object, keys);
  validateSafeExtensions(object, keys);
  const envelopeProduct = requireProduct(object.product);
  if (envelopeProduct !== product) {
    invalid();
  }
  const projectionVersion = requireVersion(object.projectionVersion);
  const kind = object.kind;
  if (kind !== "full" && kind !== "delta") {
    invalid();
  }
  return {
    product,
    projectionVersion,
    epoch: requirePositiveInteger(object.epoch),
    sequence: requirePositiveInteger(object.sequence),
    kind,
    capturedAt: requireUTCTimestamp(object.capturedAt),
    statusRevision: requirePositiveInteger(object.statusRevision),
    payload: requirePayload(object.payload, maximumPayloadBytes),
  };
}

function decodeStatus(
  product: ProductID,
  value: unknown,
  maximumPayloadBytes: number,
): StatusEnvelope {
  const object = requireObject(value);
  const keys = [
    "product",
    "statusRevision",
    "capturedAt",
    "payload",
  ] as const;
  requireFields(object, keys);
  validateSafeExtensions(object, keys);
  if (requireProduct(object.product) !== product) {
    invalid();
  }
  const payload = requirePayload(object.payload, maximumPayloadBytes);
  requireFields(payload, ["state", "reconnectAttempt"]);
  if (
    typeof payload.state !== "string" ||
    !TELEMETRY_STATUS_STATES.includes(payload.state as StatusState)
  ) {
    invalid();
  }
  return {
    product,
    statusRevision: requirePositiveInteger(object.statusRevision),
    capturedAt: requireUTCTimestamp(object.capturedAt),
    payload: {
      state: payload.state as StatusState,
      reconnectAttempt: requireNonNegativeInteger(payload.reconnectAttempt),
    },
  };
}

function decodeFact(
  product: ProductID,
  value: unknown,
  maximumPayloadBytes: number,
): FactEnvelope {
  const object = requireObject(value);
  const keys = [
    "product",
    "projectionVersion",
    "epoch",
    "sequence",
    "factSequence",
    "capturedAt",
    "statusRevision",
    "payload",
  ] as const;
  requireFields(object, keys);
  validateSafeExtensions(object, keys);
  if (requireProduct(object.product) !== product) {
    invalid();
  }
  return {
    product,
    projectionVersion: requireVersion(object.projectionVersion),
    epoch: requirePositiveInteger(object.epoch),
    sequence: requirePositiveInteger(object.sequence),
    factSequence: requirePositiveInteger(object.factSequence),
    capturedAt: requireUTCTimestamp(object.capturedAt),
    statusRevision: requirePositiveInteger(object.statusRevision),
    payload: requirePayload(object.payload, maximumPayloadBytes),
  };
}

function requireVersion(value: unknown): number {
  const version = requirePositiveInteger(value);
  if (version !== PROJECTION_VERSION) {
    throw new TransportContractError("unsupported-version");
  }
  return version;
}

function requireProduct(value: unknown): ProductID {
  if (
    typeof value !== "string" ||
    !TELEMETRY_PRODUCTS.includes(value as ProductID)
  ) {
    invalid();
  }
  return value as ProductID;
}

function requirePayload(value: unknown, maximumPayloadBytes: number): JSONObject {
  const payload = requireObject(value);
  if (!isJSONValue(payload)) {
    invalid();
  }
  const jsonPayload = payload as JSONObject;
  let encoded: string;
  try {
    encoded = JSON.stringify(jsonPayload);
  } catch {
    invalid();
  }
  if (new TextEncoder().encode(encoded!).byteLength > maximumPayloadBytes) {
    throw new TransportContractError("payload-too-large");
  }
  if (hasForbiddenKey(jsonPayload)) {
    throw new TransportContractError("forbidden-payload");
  }
  return cloneJSON(jsonPayload);
}

function isJSONValue(value: unknown, depth = 0): value is JSONValue {
  if (depth > 64) {
    return false;
  }
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "string"
  ) {
    return true;
  }
  if (typeof value === "number") {
    return Number.isFinite(value);
  }
  if (Array.isArray(value)) {
    return value.every((child) => isJSONValue(child, depth + 1));
  }
  if (
    typeof value === "object" &&
    Object.getPrototypeOf(value) === Object.prototype
  ) {
    return Object.values(value as Record<string, unknown>).every((child) =>
      isJSONValue(child, depth + 1),
    );
  }
  return false;
}

function hasForbiddenKey(value: JSONValue): boolean {
  if (Array.isArray(value)) {
    return value.some(hasForbiddenKey);
  }
  if (value !== null && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (
        [
          "raw",
          "source",
          "clock",
          "observed",
          "derived",
          "finalstate",
          "canonicalversion",
          "__proto__",
          "prototype",
          "constructor",
        ].includes(key.toLowerCase())
      ) {
        return true;
      }
      if (hasForbiddenKey(child)) {
        return true;
      }
    }
  }
  return false;
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

function requireFields(
  value: Record<string, unknown>,
  required: readonly string[],
): void {
  if (required.some((key) => !Object.hasOwn(value, key))) {
    invalid();
  }
}

function validateSafeExtensions(
  value: Record<string, unknown>,
  known: readonly string[],
): void {
  const knownKeys = new Set(known);
  for (const [key, child] of Object.entries(value)) {
    if (knownKeys.has(key)) {
      continue;
    }
    if (!isJSONValue(child) || hasForbiddenKey({ [key]: child })) {
      throw new TransportContractError("forbidden-payload");
    }
  }
}

function effectiveMaximum(value: number): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    invalid();
  }
  return Math.min(value, MAX_PAYLOAD_BYTES);
}

function requirePositiveInteger(value: unknown): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value <= 0
  ) {
    invalid();
  }
  return value;
}

function requireNonNegativeInteger(value: unknown): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0
  ) {
    invalid();
  }
  return value;
}

function requireUTCTimestamp(value: unknown): string {
  if (typeof value !== "string") {
    invalid();
  }
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?Z$/.exec(
      value,
    );
  if (!match) {
    invalid();
  }
  const parts = match.slice(1, 7).map(Number);
  const [year, month, day, hour, minute, second] = parts as [
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  const exact = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  if (
    exact.getUTCFullYear() !== year ||
    exact.getUTCMonth() !== month - 1 ||
    exact.getUTCDate() !== day ||
    exact.getUTCHours() !== hour ||
    exact.getUTCMinutes() !== minute ||
    exact.getUTCSeconds() !== second
  ) {
    invalid();
  }
  return value;
}

function cloneJSON<T extends JSONValue>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function invalid(): never {
  throw new TransportContractError("invalid-envelope");
}
