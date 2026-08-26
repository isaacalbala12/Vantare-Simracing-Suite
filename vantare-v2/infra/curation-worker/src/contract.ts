import {
  CONTRACT_VERSION,
  MAX_JSON_CARDINALITY,
  MAX_JSON_DEPTH,
} from "./constants";

export interface AdminEnvelope {
  uploadId: string;
  deleteHash: string;
}

export interface StintAggregate {
  stintNumber: number;
  laps: number;
  avgFuelPerLap: number;
  avgVEPerLap: number;
}

export interface PitAggregates {
  count: number;
  avgDurationSeconds: number;
  fuelRateLPerS?: number;
  veRatePPerS?: number;
}

export interface ObservedStrategyRef {
  stintCount: number;
  pitLaps: number[];
  compounds: string[];
}

export interface ChannelQuality {
  validSessions: number;
  invalidSessions: number;
}

export interface BundlePayload {
  contractVersion: typeof CONTRACT_VERSION;
  bundleId: string;
  combinationId: string;
  epoch: string;
  stintAggregates: StintAggregate[];
  pitAggregates?: PitAggregates;
  observedStrategies: ObservedStrategyRef[];
  channelQuality: ChannelQuality;
}

export interface CurationBundleV1 {
  admin: AdminEnvelope;
  payload: BundlePayload;
}

export class ContractError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const identifierPattern = /^[a-z0-9][a-z0-9._:-]*$/;
const epochPattern = /^\d{4}-W\d{2}$/;
const utf8 = new TextEncoder();
const denylistPatterns = [
  /steamid/i,
  /steam_id/i,
  /telemetria.*cruda/i,
  /raw.*telemetry/i,
  /driverName/i,
  /userpath/i,
  /Users\\/i,
  /@example\.com/i,
  /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
];

export function strictDecodeBundle(text: string): CurationBundleV1 {
  inspectJSONStructure(text);
  for (const pattern of denylistPatterns) {
    if (pattern.test(text)) {
      throw new ContractError("privacy_denylist", "bundle contains forbidden data");
    }
  }

  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new ContractError("invalid_json", "body must be one valid JSON value");
  }
  return validateBundle(value);
}

export function strictDecodeCommand(text: string, requiredKeys: string[]): Record<string, unknown> {
  inspectJSONStructure(text);
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new ContractError("invalid_json", "body must be one valid JSON value");
  }
  return objectWithKeys(value, requiredKeys, "command");
}

export function normalizePayload(payload: BundlePayload): BundlePayload {
  const stints = payload.stintAggregates
    .map((item) => ({ ...item }))
    .sort((left, right) => left.stintNumber - right.stintNumber);
  const strategies = payload.observedStrategies
    .map((item) => ({
      stintCount: item.stintCount,
      pitLaps: [...item.pitLaps],
      compounds: [...item.compounds],
    }))
    .sort((left, right) => compareBytes(strategyKey(left), strategyKey(right)));
  return {
    contractVersion: CONTRACT_VERSION,
    bundleId: payload.bundleId,
    combinationId: payload.combinationId,
    epoch: payload.epoch,
    stintAggregates: stints,
    ...(payload.pitAggregates === undefined
      ? {}
      : { pitAggregates: { ...payload.pitAggregates } }),
    observedStrategies: strategies,
    channelQuality: { ...payload.channelQuality },
  };
}

export function semanticPayloadJSON(payload: BundlePayload): string {
  const normalized = normalizePayload(payload);
  return JSON.stringify({ ...normalized, bundleId: "" });
}

function validateBundle(value: unknown): CurationBundleV1 {
  const root = objectWithKeys(value, ["admin", "payload"], "bundle");
  const admin = objectWithKeys(root.admin, ["uploadId", "deleteHash"], "admin");
  const payload = objectWithKeys(
    root.payload,
    [
      "contractVersion",
      "bundleId",
      "combinationId",
      "epoch",
      "stintAggregates",
      "pitAggregates?",
      "observedStrategies",
      "channelQuality",
    ],
    "payload",
  );

  const uploadId = identifier(admin.uploadId, 128, "admin.uploadId");
  const deleteHash = boundedString(admin.deleteHash, 1, 256, "admin.deleteHash");
  if (deleteHash.trim() === "") {
    fail("invalid_contract", "admin.deleteHash cannot be blank");
  }
  if (payload.contractVersion !== CONTRACT_VERSION) {
    fail("invalid_contract", "unsupported contractVersion");
  }

  const stintValues = array(payload.stintAggregates, "payload.stintAggregates");
  if (stintValues.length < 1 || stintValues.length > 256) {
    fail("invalid_contract", "payload.stintAggregates must contain 1-256 entries");
  }
  const seenStints = new Set<number>();
  let totalLaps = 0;
  const stintAggregates = stintValues.map((candidate, index): StintAggregate => {
    const item = objectWithKeys(
      candidate,
      ["stintNumber", "laps", "avgFuelPerLap", "avgVEPerLap"],
      `payload.stintAggregates[${index}]`,
    );
    const stintNumber = integer(item.stintNumber, 1, Number.MAX_SAFE_INTEGER, "stintNumber");
    if (seenStints.has(stintNumber)) {
      fail("invalid_contract", "stint numbers must be unique");
    }
    seenStints.add(stintNumber);
    const laps = integer(item.laps, 1, 100_000, "laps");
    totalLaps += laps;
    if (totalLaps > 100_000) {
      fail("invalid_contract", "total stint laps cannot exceed 100000");
    }
    return {
      stintNumber,
      laps,
      avgFuelPerLap: finiteNonNegative(item.avgFuelPerLap, "avgFuelPerLap"),
      avgVEPerLap: finiteNonNegative(item.avgVEPerLap, "avgVEPerLap"),
    };
  });

  const observedValues = array(payload.observedStrategies, "payload.observedStrategies");
  if (observedValues.length > 256) {
    fail("invalid_contract", "payload.observedStrategies cannot exceed 256 entries");
  }
  const observedStrategies = observedValues.map((candidate, index): ObservedStrategyRef => {
    const item = objectWithKeys(candidate, ["stintCount", "pitLaps", "compounds"], `strategy[${index}]`);
    const stintCount = integer(item.stintCount, 1, 256, "stintCount");
    const pitLaps = array(item.pitLaps, "pitLaps").map((lap) => integer(lap, 1, 100_000, "pitLap"));
    if (pitLaps.length !== stintCount - 1 || !strictlyIncreasing(pitLaps)) {
      fail("invalid_contract", "strategy pit laps must match stints and be sorted unique");
    }
    const compounds = array(item.compounds, "compounds").map((compound) => identifier(compound, 64, "compound"));
    if (compounds.length > stintCount) {
      fail("invalid_contract", "strategy compounds cannot exceed stint count");
    }
    return { stintCount, pitLaps, compounds };
  });

  const qualityValue = objectWithKeys(
    payload.channelQuality,
    ["validSessions", "invalidSessions"],
    "payload.channelQuality",
  );
  const channelQuality = {
    validSessions: integer(qualityValue.validSessions, 0, 1_000_000, "validSessions"),
    invalidSessions: integer(qualityValue.invalidSessions, 0, 1_000_000, "invalidSessions"),
  };
  if (channelQuality.validSessions + channelQuality.invalidSessions === 0) {
    fail("invalid_contract", "channel quality must contain a positive sample");
  }

  return {
    admin: { uploadId, deleteHash },
    payload: {
      contractVersion: CONTRACT_VERSION,
      bundleId: identifier(payload.bundleId, 128, "payload.bundleId"),
      combinationId: identifier(payload.combinationId, 128, "payload.combinationId"),
      epoch: matchingString(payload.epoch, epochPattern, "payload.epoch"),
      stintAggregates,
      ...(payload.pitAggregates === undefined
        ? {}
        : { pitAggregates: validatePitAggregates(payload.pitAggregates) }),
      observedStrategies,
      channelQuality,
    },
  };
}

function validatePitAggregates(value: unknown): PitAggregates {
  const item = objectWithKeys(
    value,
    ["count", "avgDurationSeconds", "fuelRateLPerS?", "veRatePPerS?"],
    "payload.pitAggregates",
  );
  const count = integer(item.count, 0, 1_000_000, "pit count");
  const avgDurationSeconds = finiteNonNegative(item.avgDurationSeconds, "pit duration");
  if (count > 0 && avgDurationSeconds <= 0) {
    fail("invalid_contract", "pit duration must be positive when count is positive");
  }
  const fuelRateLPerS = optionalPositiveFinite(item.fuelRateLPerS, "fuelRateLPerS");
  const veRatePPerS = optionalPositiveFinite(item.veRatePPerS, "veRatePPerS");
  return {
    count,
    avgDurationSeconds,
    ...(fuelRateLPerS === undefined ? {} : { fuelRateLPerS }),
    ...(veRatePPerS === undefined ? {} : { veRatePPerS }),
  };
}

function inspectJSONStructure(text: string): void {
  let index = 0;
  let cardinality = 0;

  const whitespace = () => {
    while (/\s/.test(text[index] ?? "")) index++;
  };
  const parseString = (): string => {
    const start = index++;
    let escaped = false;
    while (index < text.length) {
      const character = text[index++];
      if (!escaped && character === '"') {
        let decoded: unknown;
        try {
          decoded = JSON.parse(text.slice(start, index));
        } catch {
          fail("invalid_json", "invalid JSON string");
        }
        if (typeof decoded !== "string" || /[\u0000-\u001f\u007f]/.test(decoded) || hasUnpairedSurrogate(decoded)) {
          fail("anomalous_string", "JSON contains an anomalous string");
        }
        return decoded;
      }
      if (!escaped && character === "\\") escaped = true;
      else escaped = false;
    }
    fail("invalid_json", "unterminated JSON string");
  };
  const parseValue = (depth: number): void => {
    whitespace();
    const character = text[index];
    if (character === "{") {
      if (depth > MAX_JSON_DEPTH) fail("max_depth", "JSON nesting exceeds limit");
      index++;
      whitespace();
      const keys = new Set<string>();
      if (text[index] === "}") {
        index++;
        return;
      }
      for (;;) {
        whitespace();
        if (text[index] !== '"') fail("invalid_json", "object key must be a string");
        const key = parseString();
        if (keys.has(key)) fail("duplicate_field", "JSON contains a duplicate field");
        keys.add(key);
        if (++cardinality > MAX_JSON_CARDINALITY) fail("max_cardinality", "JSON cardinality exceeds limit");
        whitespace();
        if (text[index++] !== ":") fail("invalid_json", "missing colon after object key");
        parseValue(depth + 1);
        whitespace();
        const separator = text[index++];
        if (separator === "}") return;
        if (separator !== ",") fail("invalid_json", "invalid object separator");
      }
    }
    if (character === "[") {
      if (depth > MAX_JSON_DEPTH) fail("max_depth", "JSON nesting exceeds limit");
      index++;
      whitespace();
      if (text[index] === "]") {
        index++;
        return;
      }
      for (;;) {
        if (++cardinality > MAX_JSON_CARDINALITY) fail("max_cardinality", "JSON cardinality exceeds limit");
        parseValue(depth + 1);
        whitespace();
        const separator = text[index++];
        if (separator === "]") return;
        if (separator !== ",") fail("invalid_json", "invalid array separator");
      }
    }
    if (character === '"') {
      parseString();
      return;
    }
    while (index < text.length && !/[\s,}\]]/.test(text[index])) index++;
  };

  parseValue(1);
  whitespace();
  if (index !== text.length) fail("invalid_json", "body must contain one JSON value");
}

function objectWithKeys(value: unknown, allowed: string[], path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail("invalid_contract", `${path} must be an object`);
  }
  const required = new Set(allowed.filter((key) => !key.endsWith("?")));
  const accepted = new Set(allowed.map((key) => key.replace(/\?$/, "")));
  for (const key of Object.keys(value)) {
    if (!accepted.has(key)) fail("unknown_field", `${path} contains an unknown field`);
    required.delete(key);
  }
  if (required.size > 0) fail("invalid_contract", `${path} is missing a required field`);
  return value as Record<string, unknown>;
}

function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) fail("invalid_contract", `${path} must be an array`);
  return value;
}

function boundedString(value: unknown, minBytes: number, maxBytes: number, path: string): string {
  if (typeof value !== "string") fail("invalid_contract", `${path} must be a string`);
  const bytes = utf8.encode(value).byteLength;
  if (bytes < minBytes || bytes > maxBytes) fail("invalid_contract", `${path} has invalid length`);
  return value;
}

function identifier(value: unknown, maxBytes: number, path: string): string {
  const result = boundedString(value, 1, maxBytes, path);
  if (!identifierPattern.test(result)) fail("invalid_contract", `${path} must be a normalized identifier`);
  return result;
}

function matchingString(value: unknown, pattern: RegExp, path: string): string {
  if (typeof value !== "string" || !pattern.test(value)) fail("invalid_contract", `${path} has invalid format`);
  return value;
}

function integer(value: unknown, minimum: number, maximum: number, path: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    fail("invalid_contract", `${path} must be an integer in range`);
  }
  return value as number;
}

function finiteNonNegative(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    fail("invalid_contract", `${path} must be finite and non-negative`);
  }
  return value;
}

function optionalPositiveFinite(value: unknown, path: string): number | undefined {
  if (value === undefined) return undefined;
  const result = finiteNonNegative(value, path);
  if (result <= 0) fail("invalid_contract", `${path} must be positive`);
  return result;
}

function strictlyIncreasing(values: number[]): boolean {
  return values.every((value, index) => index === 0 || value > values[index - 1]);
}

function strategyKey(strategy: ObservedStrategyRef): string {
  const compounds = strategy.compounds.map((value) => `${value.length}:${value},`).join("");
  return `${strategy.stintCount}|${strategy.pitLaps.join(",")}${strategy.pitLaps.length ? "," : ""}|${compounds}`;
}

function compareBytes(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function hasUnpairedSurrogate(value: string): boolean {
  for (let index = 0; index < value.length; index++) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(++index);
      if (next < 0xdc00 || next > 0xdfff) return true;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      return true;
    }
  }
  return false;
}

function fail(code: string, message: string): never {
  throw new ContractError(code, message);
}
