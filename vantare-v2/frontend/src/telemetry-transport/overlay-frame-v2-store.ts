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

// Límite duro de seguridad del producto overlay-v2 (ISA-894 A3, aprobado
// 2026-09-04): sincronizado con OverlayV2MaxPayloadBytes del Publisher Go.
// 64 KiB sigue siendo el objetivo de rendimiento representativo; el
// transporte general conserva sus 256 KiB en telemetry-transport/contracts.
export const OVERLAY_V2_MAX_PAYLOAD_BYTES = 72 * 1024;

export type OverlayFrameV2State = Readonly<{
  revision: number;
  /** Revision of the last decoded snapshot, unchanged by status/watchdog republishes. */
  frameRevision?: number;
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
  overlay_v2_transport: Readonly<{
    revision: number;
    frameRevision: number | null;
    sourceState: OverlaySourceStatusV2["state"] | null;
    epoch: number | null;
    sequence: number | null;
    sessionId: string | null;
    vehicleCount: number;
    playerPit: string | null;
  }>;
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
      if (
        update.frame && state.frame &&
        update.frame.epoch === state.frame.epoch &&
        update.frame.sessionId === state.frame.sessionId &&
        update.frame.sequence <= state.frame.sequence
      ) {
        throw new OverlayFrameV2ContractError("sequence");
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
      publish({
        revision: update.revision,
        frameRevision: update.frame ? update.revision : state.frameRevision,
        source: update.source,
        frame,
        ageMs,
      });
    },
    getDiagnostics() {
      const sorted = [...parseDurations].sort((left, right) => left - right);
      const playerStanding = state.frame?.standings.find((row) => row.id === state.frame?.player.id);
      return Object.freeze({
        overlay_v2_parse_duration: Object.freeze({
          count: sorted.length,
          p50: percentile(sorted, 0.5),
          p99: percentile(sorted, 0.99),
          nonLiveSamples: nonLiveParseSamples,
        }),
        overlay_v2_transport: Object.freeze({
          revision: state.revision,
          frameRevision: state.frameRevision ?? null,
          sourceState: state.source?.state ?? null,
          epoch: state.frame?.epoch ?? null,
          sequence: state.frame?.sequence ?? null,
          sessionId: state.frame?.sessionId ?? null,
          vehicleCount: state.frame?.standings.length ?? 0,
          playerPit: playerStanding?.pit ?? null,
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
    "contract", "algorithm", "epoch", "sequence", "sectionMask", "sessionId", "generatedAt", "units",
    "session", "player", "controls", "standings", "relative", "relativeSettled", "delta", "fuel", "spotter", "capabilities", "damage", "weather",
  ]);
  if (value.contract !== 2) invalid(`${path}.contract`);
  positiveInteger(value.algorithm, `${path}.algorithm`);
  positiveInteger(value.epoch, `${path}.epoch`);
  positiveInteger(value.sequence, `${path}.sequence`);
  const sectionMask = value.sectionMask;
  if (typeof sectionMask !== "number" || !Number.isInteger(sectionMask) || sectionMask < 0 || sectionMask > 0x7ff) {
    invalid(`${path}.sectionMask`);
  }
  nonEmptyString(value.sessionId, `${path}.sessionId`);
  utcTimestamp(value.generatedAt, `${path}.generatedAt`);
  units(value.units, `${path}.units`);
  session(value.session, `${path}.session`);
  player(value.player, `${path}.player`);
  controls(value.controls, `${path}.controls`);
  rowArray(value.standings, `${path}.standings`, validStanding);
  relativeRowArray(value.relative, `${path}.relative`);
  relativeRowArray(value.relativeSettled, `${path}.relativeSettled`);
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
 * The controls history is seven parallel arrays: three per-mille pedal
 * series, one absolute capture instant per sample and three quality-bearing
 * motion series. Every present array must have the same length: a frame whose
 * series disagree on how many samples exist is malformed, not partially
 * usable.
 */
function controls(value: unknown, path: string): void {
  objectWithKeys(value, path, ["history"]);
  const history = value.history;
  objectWithKeys(history, `${path}.history`, ["q"], ["capturedAtMS", "throttle", "brake", "clutch", "speedMPS", "rpm", "gear"]);
  quality(history.q, `${path}.history.q`);
  let length: number | undefined;
  for (const key of ["throttle", "brake", "clutch"] as const) {
    const series = history[key];
    if (series === undefined) continue;
    perMilleSeries(series, `${path}.history.${key}`);
    if (length !== undefined && series.length !== length) invalid(`${path}.history.${key}`);
    length = series.length;
  }
  const instants = history.capturedAtMS;
  if (instants !== undefined) {
    instantSeries(instants, `${path}.history.capturedAtMS`);
    if (length !== undefined && instants.length !== length) invalid(`${path}.history.capturedAtMS`);
    length = instants.length;
  }
  for (const key of ["speedMPS", "rpm", "gear"] as const) {
    const series = history[key];
    if (series === undefined) continue;
    qvalueSeries(series, `${path}.history.${key}`);
    if (length !== undefined && series.length !== length) invalid(`${path}.history.${key}`);
    length = series.length;
  }
  Object.freeze(history);
  Object.freeze(value);
}

function instantSeries(value: unknown, path: string): asserts value is readonly number[] {
  if (!Array.isArray(value) || value.length > 120) invalid(path);
  for (const entry of value) {
    if (!Number.isSafeInteger(entry) || (entry as number) < 0) invalid(path);
  }
  Object.freeze(value);
}

function qvalueSeries(value: unknown, path: string): asserts value is readonly OverlayQValue<unknown>[] {
  if (!Array.isArray(value) || value.length > 120) invalid(path);
  for (const entry of value) {
    if (!validQValue(entry, "number")) invalid(path);
  }
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
  if (!objectHasKeys(value, ["id", "position", "classPosition", "gap", "bestLap", "lastLap", "lapDistance", "groundPosition"], ["classId", "driver", "number", "gapLaps", "pit", "laps"])) return false;
  const valid = typeof value.id === "string" && value.id.length > 0 &&
    Number.isSafeInteger(value.position) && Number.isSafeInteger(value.classPosition) &&
    validQValue(value.gap, "number") && validQValue(value.bestLap, "number") && validQValue(value.lastLap, "number") &&
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
  if (!objectHasKeys(value, ["id", "position", "gap", "groundPosition", "lastLap", "side", "authority"], ["name", "classId"])) return false;
  const valid = typeof value.id === "string" && value.id.length > 0 &&
    typeof value.position === "number" && Number.isSafeInteger(value.position) && value.position > 0 &&
    validQValue(value.gap, "number") && validGroundPosition(value.groundPosition) &&
    validQValue(value.lastLap, "number") && ["ahead", "player", "behind"].includes(value.side as string) &&
    ["native", "derived", "estimated"].includes(value.authority as string) &&
    optionalStringValue(value.name) && optionalStringValue(value.classId);
  if (valid) Object.freeze(value);
  return valid;
}

function delta(value: unknown, path: string): void {
  objectWithKeys(value, path, ["seconds", "available", "history"], ["reference", "requested", "trend", "authority"]);
  qvalue(value.seconds, `${path}.seconds`, "number");
  array(value.available, `${path}.available`, nonEmptyString);
  for (const key of ["reference", "requested", "trend"] as const) optionalString(value[key], `${path}.${key}`);
  if (value.authority !== undefined) enumValue<OverlayAuthorityV2>(value.authority, `${path}.authority`, ["native", "derived", "estimated"]);
  deltaHistory(value.history, `${path}.history`);
  Object.freeze(value);
}

// Serie de delta del jugador: un instante Unix absoluto más una cifra de
// segundos por muestra, siempre alineadas, tope 120, sin sentinels.
function deltaHistory(value: unknown, path: string): void {
  objectWithKeys(value, path, ["q"], ["capturedAtMS", "seconds"]);
  quality(value.q, `${path}.q`);
  const instants = value.capturedAtMS;
  const seconds = value.seconds;
  if (instants === undefined && seconds === undefined) {
    Object.freeze(value);
    return;
  }
  if (!Array.isArray(instants) || !Array.isArray(seconds)) invalid(path);
  if (instants.length !== seconds.length || instants.length > 120) invalid(path);
  instantSeries(instants, `${path}.capturedAtMS`);
  for (const entry of seconds) {
    if (typeof entry !== "number" || !Number.isFinite(entry)) invalid(`${path}.seconds`);
  }
  Object.freeze(seconds);
  Object.freeze(value);
}

function fuel(value: unknown, path: string): void {
  objectWithKeys(value, path, ["remaining", "capacity", "perLap", "estimatedLaps", "sessionLaps", "requiredFuel", "history"], ["basis"]);
  for (const key of ["remaining", "capacity", "perLap", "estimatedLaps", "sessionLaps", "requiredFuel"] as const) qvalue(value[key], `${path}.${key}`, "number");
  // `basis` names the arithmetic behind `estimatedLaps`; Go elides it when
  // neither projection produced a value.
  if (value.basis !== undefined) enumValue(value.basis, `${path}.basis`, ["fuel", "session"]);
  fuelHistory(value.history, `${path}.history`);
  Object.freeze(value);
}

// Serie de consumo por vuelta del jugador: un número de vuelta más una
// cifra de consumo por muestra, siempre alineadas, tope 64, sin sentinels.
function fuelHistory(value: unknown, path: string): void {
  objectWithKeys(value, path, ["q"], ["lap", "consumed"]);
  quality(value.q, `${path}.q`);
  let length: number | undefined;
  const lap = value.lap;
  if (lap !== undefined) {
    if (!Array.isArray(lap) || lap.length > 64) invalid(`${path}.lap`);
    for (const entry of lap) {
      if (!Number.isSafeInteger(entry)) invalid(`${path}.lap`);
    }
    length = lap.length;
    Object.freeze(lap);
  }
  const consumed = value.consumed;
  if (consumed !== undefined) {
    if (!Array.isArray(consumed) || consumed.length > 64) invalid(`${path}.consumed`);
    for (const entry of consumed) {
      if (typeof entry !== "number" || !Number.isFinite(entry)) invalid(`${path}.consumed`);
    }
    if (length !== undefined && consumed.length !== length) invalid(`${path}.consumed`);
    Object.freeze(consumed);
  }
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
  objectWithKeys(value, path, ["supported", "available", "modes"], ["performance"]);
  array(value.supported, `${path}.supported`, nonEmptyString);
  record(value.available, `${path}.available`, (entry, entryPath) => quality(entry, entryPath));
  objectWithKeys(value.modes, `${path}.modes`, ["spatial", "delta", "standings", "gaps"]);
  array(value.modes.spatial, `${path}.modes.spatial`, nonEmptyString);
  array(value.modes.delta, `${path}.modes.delta`, nonEmptyString);
  enumValue<OverlayModeV2>(value.modes.standings, `${path}.modes.standings`, ["none", "official", "reconstructed", "estimated"]);
  enumValue<OverlayModeV2>(value.modes.gaps, `${path}.modes.gaps`, ["none", "official", "reconstructed", "estimated"]);
  if (value.performance === undefined) {
    value.performance = {
      level: 1,
      mode: "manual",
      effects: "full",
      rafCap: null,
      widgetHz: {},
      sourceHz: 0,
      reason: "unavailable",
    };
  }
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
  if (value.reason !== undefined) enumValue(value.reason, `${path}.reason`, ["cpu", "frametime", "user", "vr", "unavailable"]);
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
    if (new TextEncoder().encode(text).byteLength > OVERLAY_V2_MAX_PAYLOAD_BYTES) invalid("size");
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

function relativeRowArray(value: unknown, path: string): void {
  if (!Array.isArray(value) || value.length > 17) invalid(path);
  rowArray(value, path, validRelative);
  if (value.length === 0) return;
  const rows = value as readonly JSONObject[];
  const playerIndex = rows.findIndex((row) => row.side === "player");
  const playerCount = rows.filter((row) => row.side === "player").length;
  if (
    playerCount !== 1 || playerIndex > 8 || rows.length - playerIndex - 1 > 8 ||
    rows.slice(0, playerIndex).some((row) => row.side !== "ahead") ||
    rows.slice(playerIndex + 1).some((row) => row.side !== "behind") ||
    new Set(rows.map((row) => row.id)).size !== rows.length
  ) invalid(path);
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
