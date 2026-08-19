import type {
  OverlayAuthorityV2,
  OverlayFrameV2,
  OverlayModeV2,
  OverlayQValue,
  OverlayQualityV2,
  OverlaySourceStatusV2,
  OverlayUpdateV2,
} from "../generated/telemetry";
import {
  createFreshnessWatchdog,
  type FreshnessWatchdogOptions,
} from "./freshness-watchdog";

export const OVERLAY_V2_SNAPSHOT_EVENT = "telemetry:overlay-v2:snapshot";
export const OVERLAY_V2_STATUS_EVENT = "telemetry:overlay-v2:status";
export const OVERLAY_V2_SNAPSHOT_REQUEST_EVENT = `${OVERLAY_V2_SNAPSHOT_EVENT}:get`;
export const OVERLAY_V2_PROJECTION_ROUTE = "/telemetry/overlay-v2/projection";

export type OverlayFrameV2State = Readonly<{
  revision: number;
  ageMs: number;
  source?: OverlaySourceStatusV2;
  frame?: OverlayFrameV2;
}>;

export type OverlayFrameV2Store = Readonly<{
  getSnapshot(): OverlayFrameV2State;
  subscribe(listener: () => void): () => void;
  ingest(name: string, input: unknown): void;
  dispose(): void;
}>;

export type OverlayFrameV2EventSource = Readonly<{
  subscribe(name: string, listener: (data: unknown) => void): () => void;
}>;

export class OverlayFrameV2ContractError extends Error {
  readonly path: string;

  constructor(path: string) {
    super(`overlay-frame-v2:invalid-contract:${path}`);
    this.name = "OverlayFrameV2ContractError";
    this.path = path;
  }
}

export function createOverlayFrameV2Store(
  options: FreshnessWatchdogOptions = {},
): OverlayFrameV2Store {
  let state: OverlayFrameV2State = Object.freeze({ revision: 0, ageMs: 0 });
  let disposed = false;
  const listeners = new Set<() => void>();
  const watchdog = createFreshnessWatchdog(refreshAge, options);

  function publish(next: OverlayFrameV2State): void {
    state = Object.freeze(next);
    for (const listener of listeners) listener();
  }

  function refreshAge(): void {
    if (disposed || !state.frame) return;
    const measurement = watchdog.measure(state.frame.generatedAt);
    const source = state.source
      ? Object.freeze({
          ...state.source,
          ageMs: measurement.ageMs,
          state: measurement.stale &&
            (state.source.state === "live" || state.source.state === "degraded" || state.source.state === "stale")
            ? "stale"
            : state.source.state,
        })
      : undefined;
    publish({ ...state, ageMs: measurement.ageMs, source });
  }

  return {
    getSnapshot: () => state,
    subscribe(listener) {
      if (disposed) throw new OverlayFrameV2ContractError("disposed");
      listeners.add(listener);
      if (listeners.size === 1) watchdog.start();
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) watchdog.stop();
      };
    },
    ingest(name, input) {
      if (disposed) throw new OverlayFrameV2ContractError("disposed");
      if (name !== OVERLAY_V2_SNAPSHOT_EVENT && name !== OVERLAY_V2_STATUS_EVENT) {
        throw new OverlayFrameV2ContractError("event");
      }
      const update = decodeOverlayUpdateV2(input);
      if (update.revision <= state.revision) {
        throw new OverlayFrameV2ContractError("revision");
      }
      if (name === OVERLAY_V2_SNAPSHOT_EVENT && update.frame === null) {
        throw new OverlayFrameV2ContractError("frame");
      }
      if (name === OVERLAY_V2_STATUS_EVENT && update.frame !== null) {
        throw new OverlayFrameV2ContractError("frame");
      }
      const frame = update.frame ?? state.frame;
      const ageMs = frame ? watchdog.measure(frame.generatedAt).ageMs : update.source.ageMs ?? 0;
      publish({ revision: update.revision, source: update.source, frame, ageMs });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      watchdog.stop();
      listeners.clear();
    },
  };
}

export function attachOverlayFrameV2Transport(
  store: OverlayFrameV2Store,
  source: OverlayFrameV2EventSource,
  onError: (error: unknown) => void = () => undefined,
  requestReplay?: () => void,
): () => void {
  let active = true;
  const removers: (() => void)[] = [];
  try {
    for (const name of [OVERLAY_V2_STATUS_EVENT, OVERLAY_V2_SNAPSHOT_EVENT]) {
      removers.push(source.subscribe(name, (data) => {
        if (!active) return;
        try {
          store.ingest(name, data);
        } catch (error) {
          onError(error);
        }
      }));
    }
    requestReplay?.();
  } catch (error) {
    active = false;
    cleanup(removers);
    throw error;
  }
  return () => {
    if (!active) return;
    active = false;
    cleanup(removers);
  };
}

export type OverlayFrameV2EventSourceLike = Readonly<{
  addEventListener(type: string, listener: (event: { data: unknown }) => void): void;
  close(): void;
}>;

export function attachOverlayFrameV2Sse(
  store: OverlayFrameV2Store,
  options: Readonly<{
    url?: string;
    createEventSource?: (url: string) => OverlayFrameV2EventSourceLike;
    onError?: (error: unknown) => void;
  }> = {},
): () => void {
  const factory = options.createEventSource ?? ((url: string) => new EventSource(url));
  const source = factory(options.url ?? OVERLAY_V2_PROJECTION_ROUTE);
  for (const name of [OVERLAY_V2_STATUS_EVENT, OVERLAY_V2_SNAPSHOT_EVENT]) {
    source.addEventListener(name, (event) => {
      try {
        store.ingest(name, event.data);
      } catch (error) {
        options.onError?.(error);
      }
    });
  }
  return () => source.close();
}

export function decodeOverlayUpdateV2(input: unknown): OverlayUpdateV2 {
  const value = cloneJSONInput(input);
  objectWithKeys(value, "update", ["revision", "source", "frame"]);
  positiveInteger(value.revision, "revision");
  sourceStatus(value.source, "source");
  if (value.frame !== null) frame(value.frame, "frame");
  return deepFreeze(value) as unknown as OverlayUpdateV2;
}

function sourceStatus(value: unknown, path: string): void {
  objectWithKeys(value, path, ["state"], ["retry", "ageMs", "reason"]);
  nonEmptyString(value.state, `${path}.state`);
  optionalNonNegativeInteger(value.retry, `${path}.retry`);
  optionalNonNegativeInteger(value.ageMs, `${path}.ageMs`);
  optionalString(value.reason, `${path}.reason`);
}

function frame(value: unknown, path: string): void {
  objectWithKeys(value, path, [
    "contract", "algorithm", "epoch", "sequence", "sessionId", "generatedAt", "units",
    "session", "player", "standings", "relative", "delta", "fuel", "spotter", "capabilities",
  ]);
  if (value.contract !== 2) invalid(`${path}.contract`);
  positiveInteger(value.algorithm, `${path}.algorithm`);
  positiveInteger(value.epoch, `${path}.epoch`);
  positiveInteger(value.sequence, `${path}.sequence`);
  nonEmptyString(value.sessionId, `${path}.sessionId`);
  utcTimestamp(value.generatedAt, `${path}.generatedAt`);
  units(value.units, `${path}.units`);
  session(value.session, `${path}.session`);
  player(value.player, `${path}.player`);
  array(value.standings, `${path}.standings`, standing);
  array(value.relative, `${path}.relative`, relative);
  delta(value.delta, `${path}.delta`);
  fuel(value.fuel, `${path}.fuel`);
  spotter(value.spotter, `${path}.spotter`);
  capabilities(value.capabilities, `${path}.capabilities`);
}

function units(value: unknown, path: string): void {
  objectWithKeys(value, path, ["speed", "temperature", "pressure", "fuel"]);
  enumValue(value.speed, `${path}.speed`, ["mps", "kph", "mph"]);
  enumValue(value.temperature, `${path}.temperature`, ["celsius", "fahrenheit"]);
  enumValue(value.pressure, `${path}.pressure`, ["kpa", "psi"]);
  enumValue(value.fuel, `${path}.fuel`, ["liters", "gallons-us"]);
}

function session(value: unknown, path: string): void {
  objectWithKeys(value, path, ["track", "phase", "flag", "remaining", "maxLaps"]);
  qvalue(value.track, `${path}.track`, "string");
  qvalue(value.phase, `${path}.phase`, "string");
  qvalue(value.flag, `${path}.flag`, "string");
  qvalue(value.remaining, `${path}.remaining`, "number");
  qvalue(value.maxLaps, `${path}.maxLaps`, "number");
}

function player(value: unknown, path: string): void {
  objectWithKeys(value, path, ["speed", "rpm", "gear", "throttle", "brake", "clutch", "steering"], ["id"]);
  optionalString(value.id, `${path}.id`);
  for (const key of ["speed", "rpm", "gear", "throttle", "brake", "clutch", "steering"] as const) {
    qvalue(value[key], `${path}.${key}`, "number");
  }
}

function standing(value: unknown, path: string): void {
  objectWithKeys(value, path, ["id", "position", "classPosition", "gap", "lastLap"], ["classId", "driver", "number", "gapLaps", "pit", "laps"]);
  nonEmptyString(value.id, `${path}.id`);
  integer(value.position, `${path}.position`);
  integer(value.classPosition, `${path}.classPosition`);
  qvalue(value.gap, `${path}.gap`, "number");
  qvalue(value.lastLap, `${path}.lastLap`, "number");
  for (const key of ["classId", "driver", "number", "pit"] as const) optionalString(value[key], `${path}.${key}`);
  for (const key of ["gapLaps", "laps"] as const) optionalInteger(value[key], `${path}.${key}`);
}

function relative(value: unknown, path: string): void {
  objectWithKeys(value, path, ["id", "gap", "side", "authority"], ["name"]);
  nonEmptyString(value.id, `${path}.id`);
  qvalue(value.gap, `${path}.gap`, "number");
  nonEmptyString(value.side, `${path}.side`);
  enumValue<OverlayAuthorityV2>(value.authority, `${path}.authority`, ["native", "derived", "estimated"]);
  optionalString(value.name, `${path}.name`);
}

function delta(value: unknown, path: string): void {
  objectWithKeys(value, path, ["seconds", "available"], ["reference", "requested", "trend", "authority"]);
  qvalue(value.seconds, `${path}.seconds`, "number");
  array(value.available, `${path}.available`, nonEmptyString);
  for (const key of ["reference", "requested", "trend"] as const) optionalString(value[key], `${path}.${key}`);
  if (value.authority !== undefined) enumValue<OverlayAuthorityV2>(value.authority, `${path}.authority`, ["native", "derived", "estimated"]);
}

function fuel(value: unknown, path: string): void {
  objectWithKeys(value, path, ["remaining", "capacity", "perLap", "estimatedLaps"]);
  for (const key of ["remaining", "capacity", "perLap", "estimatedLaps"] as const) qvalue(value[key], `${path}.${key}`, "number");
}

function spotter(value: unknown, path: string): void {
  objectWithKeys(value, path, ["mode", "left", "right"]);
  enumValue<OverlayModeV2>(value.mode, `${path}.mode`, ["none", "official", "reconstructed", "estimated"]);
  qvalue(value.left, `${path}.left`, "boolean");
  qvalue(value.right, `${path}.right`, "boolean");
}

function capabilities(value: unknown, path: string): void {
  objectWithKeys(value, path, ["supported", "available", "modes"]);
  array(value.supported, `${path}.supported`, nonEmptyString);
  record(value.available, `${path}.available`, (entry, entryPath) => quality(entry, entryPath));
  objectWithKeys(value.modes, `${path}.modes`, ["spatial", "delta", "standings", "gaps"]);
  array(value.modes.spatial, `${path}.modes.spatial`, nonEmptyString);
  array(value.modes.delta, `${path}.modes.delta`, nonEmptyString);
  enumValue<OverlayModeV2>(value.modes.standings, `${path}.modes.standings`, ["none", "official", "reconstructed", "estimated"]);
  enumValue<OverlayModeV2>(value.modes.gaps, `${path}.modes.gaps`, ["none", "official", "reconstructed", "estimated"]);
}

function qvalue(value: unknown, path: string, kind: "number" | "string" | "boolean"): asserts value is OverlayQValue<unknown> {
  objectWithKeys(value, path, ["q"], ["v"]);
  quality(value.q, `${path}.q`);
  if (value.v !== undefined && (typeof value.v !== kind || (kind === "number" && !Number.isFinite(value.v)))) invalid(`${path}.v`);
  if (value.q === "missing" && value.v !== undefined) invalid(`${path}.v`);
}

function quality(value: unknown, path: string): asserts value is OverlayQualityV2 {
  enumValue<OverlayQualityV2>(value, path, ["fresh", "stale", "missing", "invalid"]);
}

type JSONObject = Record<string, unknown>;

function cloneJSONInput(input: unknown): JSONObject {
  try {
    const text = typeof input === "string" ? input : JSON.stringify(input);
    if (new TextEncoder().encode(text).byteLength > 64 * 1024) invalid("size");
    const value = JSON.parse(text) as unknown;
    if (!plainObject(value)) invalid("update");
    return value;
  } catch (error) {
    if (error instanceof OverlayFrameV2ContractError) throw error;
    invalid("json");
  }
}

function objectWithKeys(value: unknown, path: string, required: readonly string[], optional: readonly string[] = []): asserts value is JSONObject {
  if (!plainObject(value)) invalid(path);
  const allowed = new Set([...required, ...optional]);
  if (required.some((key) => !(key in value)) || Object.keys(value).some((key) => !allowed.has(key))) invalid(path);
}

function plainObject(value: unknown): value is JSONObject {
  return value !== null && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function array(value: unknown, path: string, validate: (value: unknown, path: string) => void): void {
  if (!Array.isArray(value)) invalid(path);
  value.forEach((entry, index) => validate(entry, `${path}[${index}]`));
}

function record(value: unknown, path: string, validate: (value: unknown, path: string) => void): void {
  if (!plainObject(value)) invalid(path);
  for (const [key, entry] of Object.entries(value)) validate(entry, `${path}.${key}`);
}

function enumValue<T extends string>(value: unknown, path: string, allowed: readonly T[]): asserts value is T {
  if (typeof value !== "string" || !allowed.includes(value as T)) invalid(path);
}

function positiveInteger(value: unknown, path: string): void {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) invalid(path);
}

function integer(value: unknown, path: string): void {
  if (!Number.isSafeInteger(value)) invalid(path);
}

function optionalInteger(value: unknown, path: string): void {
  if (value !== undefined) integer(value, path);
}

function optionalNonNegativeInteger(value: unknown, path: string): void {
  if (value !== undefined && (!Number.isSafeInteger(value) || (value as number) < 0)) invalid(path);
}

function nonEmptyString(value: unknown, path: string): void {
  if (typeof value !== "string" || value.length === 0) invalid(path);
}

function optionalString(value: unknown, path: string): void {
  if (value !== undefined && typeof value !== "string") invalid(path);
}

function utcTimestamp(value: unknown, path: string): void {
  if (typeof value !== "string" || !value.endsWith("Z") || !Number.isFinite(Date.parse(value))) invalid(path);
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function cleanup(removers: readonly (() => void)[]): void {
  let firstError: unknown;
  for (const remove of removers) {
    try {
      remove();
    } catch (error) {
      firstError ??= error;
    }
  }
  if (firstError !== undefined) throw firstError;
}

function invalid(path: string): never {
  throw new OverlayFrameV2ContractError(path);
}
