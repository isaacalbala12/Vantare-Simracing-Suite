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
  getDiagnostics(): OverlayFrameV2StoreDiagnostics;
  reset(): void;
  dispose(): void;
}>;

export type OverlayFrameV2StoreDiagnostics = Readonly<{
  /** Percentiles over the current live window only; see `ingest`. */
  overlay_v2_parse_duration: Readonly<{ count: number; p50: number; p99: number; nonLiveSamples: number }>;
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
  const parseDurations: number[] = [];
  let currentStream: string | undefined;
  let nonLiveParseSamples = 0;
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
      const started = performance.now();
      const update = decodeOverlayUpdateV2(input);
      const elapsed = performance.now() - started;
      // The percentiles describe the current live window only. Samples taken
      // while the source is stale, degraded or reconnecting mix a different
      // regime into the same ring and made the published p99 unreadable.
      if (update.source.state === "live") {
        parseDurations.push(elapsed);
        if (parseDurations.length > 512) parseDurations.shift();
      } else {
        nonLiveParseSamples += 1;
      }
      if (update.revision <= state.revision) {
        throw new OverlayFrameV2ContractError("revision");
      }
      if (name === OVERLAY_V2_SNAPSHOT_EVENT && update.frame === null) {
        throw new OverlayFrameV2ContractError("frame");
      }
      if (name === OVERLAY_V2_STATUS_EVENT && update.frame !== null) {
        throw new OverlayFrameV2ContractError("frame");
      }
      // The 512-sample ring already rotates per sample, but its percentiles
      // must not mix two runs: a new epoch or session id starts a fresh window.
      if (update.frame) {
        const stream = `${update.frame.epoch}:${update.frame.sessionId}`;
        if (currentStream !== undefined && currentStream !== stream) {
          parseDurations.length = 0;
          nonLiveParseSamples = 0;
        }
        currentStream = stream;
      }
      const frame = update.frame ?? state.frame;
      const ageMs = frame ? watchdog.measure(frame.generatedAt).ageMs : update.source.ageMs ?? 0;
      publish({ revision: update.revision, source: update.source, frame, ageMs });
    },
    getDiagnostics() {
      const sorted = [...parseDurations].sort((left, right) => left - right);
      return Object.freeze({
        overlay_v2_parse_duration: Object.freeze({
          count: sorted.length,
          p50: percentile(sorted, 0.5),
          p99: percentile(sorted, 0.99),
          nonLiveSamples: nonLiveParseSamples,
        }),
      });
    },
    reset() {
      if (disposed) throw new OverlayFrameV2ContractError("disposed");
      currentStream = undefined;
      parseDurations.length = 0;
      nonLiveParseSamples = 0;
      publish({ revision: 0, ageMs: 0 });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      watchdog.stop();
      listeners.clear();
    },
  };
}

function percentile(sorted: readonly number[], fraction: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.ceil(sorted.length * fraction) - 1] ?? 0;
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
  return Object.freeze(value) as unknown as OverlayUpdateV2;
}

function sourceStatus(value: unknown, path: string): void {
  objectWithKeys(value, path, ["state"], ["retry", "ageMs", "reason"]);
  enumValue(value.state, `${path}.state`, [
    "stopped", "detecting", "connecting", "live", "degraded", "stale", "error", "stopping",
  ]);
  optionalNonNegativeInteger(value.retry, `${path}.retry`);
  optionalNonNegativeInteger(value.ageMs, `${path}.ageMs`);
  optionalString(value.reason, `${path}.reason`);
  Object.freeze(value);
}

function frame(value: unknown, path: string): void {
  objectWithKeys(value, path, [
    "contract", "algorithm", "epoch", "sequence", "sessionId", "generatedAt", "units",
    "session", "player", "controls", "standings", "relative", "delta", "fuel", "spotter", "capabilities", "damage", "weather",
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
  controls(value.controls, `${path}.controls`);
  rowArray(value.standings, `${path}.standings`, validStanding);
  rowArray(value.relative, `${path}.relative`, validRelative);
  delta(value.delta, `${path}.delta`);
  fuel(value.fuel, `${path}.fuel`);
  spotter(value.spotter, `${path}.spotter`);
  capabilities(value.capabilities, `${path}.capabilities`);
  damage(value.damage, `${path}.damage`);
  weather(value.weather, `${path}.weather`);
  Object.freeze(value);
}

function units(value: unknown, path: string): void {
  objectWithKeys(value, path, ["speed", "temperature", "pressure", "fuel"]);
  enumValue(value.speed, `${path}.speed`, ["mps", "kph", "mph"]);
  enumValue(value.temperature, `${path}.temperature`, ["celsius", "fahrenheit"]);
  enumValue(value.pressure, `${path}.pressure`, ["kpa", "psi"]);
  enumValue(value.fuel, `${path}.fuel`, ["liters", "gallons-us"]);
  Object.freeze(value);
}

function session(value: unknown, path: string): void {
  objectWithKeys(value, path, ["track", "phase", "flag", "remaining", "maxLaps"]);
  qvalue(value.track, `${path}.track`, "string");
  qvalue(value.phase, `${path}.phase`, "string");
  qvalue(value.flag, `${path}.flag`, "string");
  qvalue(value.remaining, `${path}.remaining`, "number");
  qvalue(value.maxLaps, `${path}.maxLaps`, "number");
  Object.freeze(value);
}

function player(value: unknown, path: string): void {
  objectWithKeys(value, path, ["speed", "rpm", "gear", "throttle", "brake", "clutch", "steering"], ["id"]);
  optionalString(value.id, `${path}.id`);
  for (const key of ["speed", "rpm", "gear", "throttle", "brake", "clutch", "steering"] as const) {
    qvalue(value[key], `${path}.${key}`, "number");
  }
  Object.freeze(value);
}

/**
 * The controls history is three parallel per-mille arrays. They must have the
 * same length: a frame whose pedals disagree on how many samples exist is
 * malformed, not partially usable.
 */
function controls(value: unknown, path: string): void {
  objectWithKeys(value, path, ["history"]);
  const history = value.history;
  objectWithKeys(history, `${path}.history`, ["q"], ["windowMs", "throttle", "brake", "clutch"]);
  quality(history.q, `${path}.history.q`);
  optionalNonNegativeInteger(history.windowMs, `${path}.history.windowMs`);
  let length: number | undefined;
  for (const key of ["throttle", "brake", "clutch"] as const) {
    const series = history[key];
    if (series === undefined) continue;
    perMilleSeries(series, `${path}.history.${key}`);
    if (length !== undefined && series.length !== length) invalid(`${path}.history.${key}`);
    length = series.length;
  }
  Object.freeze(history);
  Object.freeze(value);
}

function perMilleSeries(value: unknown, path: string): asserts value is readonly number[] {
  if (!Array.isArray(value) || value.length > 120) invalid(path);
  for (const entry of value) {
    if (!Number.isSafeInteger(entry) || entry < 0 || entry > 1000) invalid(path);
  }
  Object.freeze(value);
}

function validStanding(value: unknown): boolean {
  if (!objectHasKeys(value, ["id", "position", "classPosition", "gap", "lastLap", "lapDistance", "groundPosition"], ["classId", "driver", "number", "gapLaps", "pit", "laps"])) return false;
  const valid = typeof value.id === "string" && value.id.length > 0 &&
    Number.isSafeInteger(value.position) && Number.isSafeInteger(value.classPosition) &&
    validQValue(value.gap, "number") && validQValue(value.lastLap, "number") &&
    validQValue(value.lapDistance, "number") && validGroundPosition(value.groundPosition) &&
    [value.classId, value.driver, value.number, value.pit].every(optionalStringValue) &&
    [value.gapLaps, value.laps].every(optionalIntegerValue);
  if (valid) Object.freeze(value);
  return valid;
}

function damage(value: unknown, path: string): void {
  objectWithKeys(value, path, ["dents", "overheating", "detached", "wheelDetachedCount"]);
  dentsValue(value.dents, `${path}.dents`);
  qvalue(value.overheating, `${path}.overheating`, "boolean");
  qvalue(value.detached, `${path}.detached`, "boolean");
  qvalue(value.wheelDetachedCount, `${path}.wheelDetachedCount`, "number");
  Object.freeze(value);
}

/** dents is a QValue whose `v` (when present) is exactly eight severities 0..255. */
function dentsValue(value: unknown, path: string): void {
  if (!objectHasKeys(value, ["q"], ["v"])) invalid(path);
  if (!["fresh", "stale", "missing", "invalid"].includes(value.q as string)) invalid(`${path}.q`);
  if (value.q === "missing" && value.v !== undefined) invalid(`${path}.v`);
  if (value.v !== undefined) {
    if (!Array.isArray(value.v) || value.v.length !== 8) invalid(`${path}.v`);
    for (const item of value.v) {
      if (!Number.isSafeInteger(item) || (item as number) < 0 || (item as number) > 255) invalid(`${path}.v`);
    }
    Object.freeze(value.v);
  }
  Object.freeze(value);
}

/** groundPosition is a QValue whose `v` (when present) is a plain {x, z} in metres. */
function validGroundPosition(value: unknown): boolean {
  if (!objectHasKeys(value, ["q"], ["v"])) return false;
  if (!["fresh", "stale", "missing", "invalid"].includes(value.q as string)) return false;
  if (value.q === "missing" && value.v !== undefined) return false;
  if (value.v !== undefined) {
    if (!objectHasKeys(value.v, ["x", "z"])) return false;
    if (!Number.isFinite(value.v.x) || !Number.isFinite(value.v.z)) return false;
    Object.freeze(value.v);
  }
  Object.freeze(value);
  return true;
}

function weather(value: unknown, path: string): void {
  objectWithKeys(value, path, ["ambientC", "trackC", "rainPercent", "wetnessPct", "windKph", "windDir", "pressureHpa"]);
  for (const key of ["ambientC", "trackC", "rainPercent", "wetnessPct", "windKph", "pressureHpa"] as const) {
    qvalue(value[key], `${path}.${key}`, "number");
  }
  qvalue(value.windDir, `${path}.windDir`, "string");
  Object.freeze(value);
}

function validRelative(value: unknown): boolean {
  if (!objectHasKeys(value, ["id", "gap", "side", "authority"], ["name", "classId"])) return false;
  const valid = typeof value.id === "string" && value.id.length > 0 &&
    validQValue(value.gap, "number") && typeof value.side === "string" && value.side.length > 0 &&
    ["native", "derived", "estimated"].includes(value.authority as string) &&
    optionalStringValue(value.name) && optionalStringValue(value.classId);
  if (valid) Object.freeze(value);
  return valid;
}

function delta(value: unknown, path: string): void {
  objectWithKeys(value, path, ["seconds", "available"], ["reference", "requested", "trend", "authority"]);
  qvalue(value.seconds, `${path}.seconds`, "number");
  array(value.available, `${path}.available`, nonEmptyString);
  for (const key of ["reference", "requested", "trend"] as const) optionalString(value[key], `${path}.${key}`);
  if (value.authority !== undefined) enumValue<OverlayAuthorityV2>(value.authority, `${path}.authority`, ["native", "derived", "estimated"]);
  Object.freeze(value);
}

function fuel(value: unknown, path: string): void {
  objectWithKeys(value, path, ["remaining", "capacity", "perLap", "estimatedLaps"], ["basis"]);
  for (const key of ["remaining", "capacity", "perLap", "estimatedLaps"] as const) qvalue(value[key], `${path}.${key}`, "number");
  // `basis` names the arithmetic behind `estimatedLaps`; Go elides it when
  // neither projection produced a value.
  if (value.basis !== undefined) enumValue(value.basis, `${path}.basis`, ["fuel", "session"]);
  Object.freeze(value);
}

function spotter(value: unknown, path: string): void {
  objectWithKeys(value, path, ["mode", "left", "right"]);
  // "xyz" is the spotter's own mode: the verdict came from full 3D positions.
  enumValue<OverlayModeV2>(value.mode, `${path}.mode`, ["none", "official", "reconstructed", "estimated", "xyz"]);
  qvalue(value.left, `${path}.left`, "boolean");
  qvalue(value.right, `${path}.right`, "boolean");
  Object.freeze(value);
}

function capabilities(value: unknown, path: string): void {
  objectWithKeys(value, path, ["supported", "available", "modes", "performance"]);
  array(value.supported, `${path}.supported`, nonEmptyString);
  record(value.available, `${path}.available`, (entry, entryPath) => quality(entry, entryPath));
  objectWithKeys(value.modes, `${path}.modes`, ["spatial", "delta", "standings", "gaps"]);
  array(value.modes.spatial, `${path}.modes.spatial`, nonEmptyString);
  array(value.modes.delta, `${path}.modes.delta`, nonEmptyString);
  enumValue<OverlayModeV2>(value.modes.standings, `${path}.modes.standings`, ["none", "official", "reconstructed", "estimated"]);
  enumValue<OverlayModeV2>(value.modes.gaps, `${path}.modes.gaps`, ["none", "official", "reconstructed", "estimated"]);
  performancePolicy(value.performance, `${path}.performance`);
  Object.freeze(value.modes);
  Object.freeze(value);
}

function performancePolicy(value: unknown, path: string): void {
  objectWithKeys(value, path, ["level", "mode", "effects", "rafCap", "widgetHz", "sourceHz"], ["reason"]);
  if (!Number.isSafeInteger(value.level) || (value.level as number) < 1 || (value.level as number) > 5) invalid(`${path}.level`);
  enumValue(value.mode, `${path}.mode`, ["manual", "custom", "auto"]);
  enumValue(value.effects, `${path}.effects`, ["full", "noBlur", "flat"]);
  if (value.rafCap !== null) positiveInteger(value.rafCap, `${path}.rafCap`);
  record(value.widgetHz, `${path}.widgetHz`, (rate, ratePath) => {
    if (rate === "dirty" || rate === "event") return;
    if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) invalid(ratePath);
  });
  if (typeof value.sourceHz !== "number" || !Number.isFinite(value.sourceHz) || value.sourceHz < 0) invalid(`${path}.sourceHz`);
  optionalString(value.reason, `${path}.reason`);
  Object.freeze(value);
}

function qvalue(value: unknown, path: string, kind: "number" | "string" | "boolean"): asserts value is OverlayQValue<unknown> {
  if (!validQValue(value, kind)) invalid(path);
}

function validQValue(value: unknown, kind: "number" | "string" | "boolean"): value is OverlayQValue<unknown> {
  if (!objectHasKeys(value, ["q"], ["v"])) return false;
  if (!["fresh", "stale", "missing", "invalid"].includes(value.q as string)) return false;
  if (value.v !== undefined && (typeof value.v !== kind || (kind === "number" && !Number.isFinite(value.v)))) return false;
  if (value.q === "missing" && value.v !== undefined) return false;
  Object.freeze(value);
  return true;
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
  if (!objectHasKeys(value, required, optional)) invalid(path);
}

function objectHasKeys(value: unknown, required: readonly string[], optional: readonly string[] = []): value is JSONObject {
  return plainObject(value) &&
    !required.some((key) => !(key in value)) &&
    !Object.keys(value).some((key) => !required.includes(key) && !optional.includes(key));
}

function plainObject(value: unknown): value is JSONObject {
  return value !== null && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function array(value: unknown, path: string, validate: (value: unknown, path: string) => void): void {
  if (!Array.isArray(value)) invalid(path);
  value.forEach((entry, index) => validate(entry, `${path}[${index}]`));
  Object.freeze(value);
}

function rowArray(value: unknown, path: string, validate: (value: unknown) => boolean): void {
  if (!Array.isArray(value)) invalid(path);
  for (let index = 0; index < value.length; index += 1) {
    if (!validate(value[index])) invalid(`${path}[${index}]`);
  }
  Object.freeze(value);
}

function record(value: unknown, path: string, validate: (value: unknown, path: string) => void): void {
  if (!plainObject(value)) invalid(path);
  for (const [key, entry] of Object.entries(value)) validate(entry, `${path}.${key}`);
  Object.freeze(value);
}

function enumValue<T extends string>(value: unknown, path: string, allowed: readonly T[]): asserts value is T {
  if (typeof value !== "string" || !allowed.includes(value as T)) invalid(path);
}

function positiveInteger(value: unknown, path: string): void {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) invalid(path);
}

function optionalIntegerValue(value: unknown): boolean {
  return value === undefined || Number.isSafeInteger(value);
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

function optionalStringValue(value: unknown): boolean {
  return value === undefined || typeof value === "string";
}

function utcTimestamp(value: unknown, path: string): void {
  if (typeof value !== "string" || !value.endsWith("Z") || !Number.isFinite(Date.parse(value))) invalid(path);
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
