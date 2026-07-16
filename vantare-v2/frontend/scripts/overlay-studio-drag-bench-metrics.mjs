/**
 * Pure metric helpers for overlay studio drag benchmark.
 */

/**
 * @param {number[]} values
 */
export function percentile(values, p) {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

/**
 * @param {number[]} values
 */
export function average(values) {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/**
 * @param {number[]} values
 */
export function standardDeviation(values) {
  if (values.length <= 1) {
    return 0;
  }
  const mean = average(values);
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

/**
 * @param {{
 *   stepLags: number[];
 *   frameDeltaMs: number[];
 *   longTaskCount: number;
 *   droppedMoves: number;
 *   moveSteps: number;
 * }} samples
 */
export function computeTraceMetrics(samples) {
  const lags = samples.stepLags ?? [];
  const moveSteps = samples.moveSteps ?? 0;
  const droppedMoves = samples.droppedMoves ?? 0;
  const droppedFramesPct = moveSteps === 0 ? 0 : (droppedMoves / moveSteps) * 100;

  return {
    pointerLagMs_p50: percentile(lags, 50),
    pointerLagMs_p95: percentile(lags, 95),
    maxPointerLagMs: lags.length === 0 ? 0 : Math.max(...lags),
    avgFrameTimeMs: average(samples.frameDeltaMs ?? []),
    p95FrameTimeMs: percentile(samples.frameDeltaMs ?? [], 95),
    droppedFramesPct,
    jitterPx: standardDeviation(lags),
    longTaskCount: samples.longTaskCount ?? 0,
    pointerMoveCount: moveSteps,
    frameSampleCount: (samples.frameDeltaMs ?? []).length,
  };
}

/**
 * @param {Record<string, number>} metrics
 * @param {{ scoreWeights: Record<string, number> }} config
 */
export function computeCompositeScore(metrics, config) {
  const weights = config.scoreWeights ?? {};
  let score = 100;
  for (const [key, weight] of Object.entries(weights)) {
    const value = metrics[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      score -= weight * value;
    }
  }
  return score;
}

/**
 * @param {Record<string, number>} metrics
 * @param {{ gates?: Record<string, number | boolean>; traceGates?: Record<string, Record<string, number>> }} config
 * @param {string} [traceKind]
 */
export function evaluateGates(metrics, config, traceKind = "move") {
  const gateSet = config.traceGates?.[traceKind] ?? config.gates ?? {};
  const failures = [];

  const numericChecks = [
    ["pointerLagMs_p95", "pointerLagMs_p95Max", "lte"],
    ["maxPointerLagMs", "maxPointerLagMsMax", "lte"],
    ["avgFrameTimeMs", "avgFrameTimeMsMax", "lte"],
    ["droppedFramesPct", "droppedFramesPctMax", "lte"],
    ["longTaskCount", "longTaskCountMax", "lte"],
    ["jitterPx", "jitterPxMax", "lte"],
  ];

  for (const [metricKey, gateKey, mode] of numericChecks) {
    const limit = gateSet[gateKey];
    const value = metrics[metricKey];
    if (typeof limit !== "number" || typeof value !== "number") {
      continue;
    }
    const failed = mode === "lte" ? value > limit : value < limit;
    if (failed) {
      failures.push(`${metricKey}=${value} exceeds ${gateKey}=${limit}`);
    }
  }

  return {
    ok: failures.length === 0,
    failures,
  };
}