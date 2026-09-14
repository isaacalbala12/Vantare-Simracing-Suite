import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
// Copia congelada de la clausura usada para publicar este paquete en
// 659b2c57dc2c7fc75962cc3c8e425ed1289266ec. No debe seguir la evolución del
// colector activo: su única responsabilidad es recalcular esta evidencia.
const MIB = 1024 * 1024;
const REQUIRED_SAMPLE_ROLES = new Set(["go-host", "browser", "gpu-process"]);
const EXPECTED_WINDOWS = Object.freeze({
  S1: Object.freeze(["desktop"]),
  S2: Object.freeze(["desktop"]),
  S3: Object.freeze(["desktop"]),
  S4: Object.freeze(["desktop"]),
  S5: Object.freeze(["desktop", "studio-or-obs"]),
});

function result(status, detail, evidence = {}) {
  return {status, detail, ...evidence};
}

function targetKey(target) {
  return `${targetSurface(target)}|${target.role ?? "unknown"}|${target.url ?? ""}|${target.title ?? ""}`;
}

function targetSurface(target) {
  if (target.surface) return String(target.surface);
  if (target.role === "overlay") {
    try {
      const url = new URL(target.url);
      return url.pathname !== "/overlay.html" || url.searchParams.get("obs") === "1" ? "obs" : "desktop";
    } catch {
      return "desktop";
    }
  }
  return target.role === "hub" && target.diagnostics?.pull ? "studio" : String(target.role ?? "unknown");
}

function expectedKind(surface) {
  return surface === "studio" || surface === "obs" ? "studio-or-obs" : surface;
}

function linearSlopeMiBPerHour(samples) {
  if (samples.length < 2) return null;
  const origin = Date.parse(samples[0].timestamp);
  const points = samples.map((sample) => ({
    x: (Date.parse(sample.timestamp) - origin) / 3_600_000,
    y: Number(sample.privateBytes) / MIB,
  })).filter(({x, y}) => Number.isFinite(x) && Number.isFinite(y));
  if (points.length < 2) return null;
  const meanX = points.reduce((sum, point) => sum + point.x, 0) / points.length;
  const meanY = points.reduce((sum, point) => sum + point.y, 0) / points.length;
  const variance = points.reduce((sum, point) => sum + (point.x - meanX) ** 2, 0);
  if (variance === 0) return null;
  return points.reduce((sum, point) => sum + (point.x - meanX) * (point.y - meanY), 0) / variance;
}

function memoryCriterion(input) {
  const groups = new Map();
  for (const sample of input.samples ?? []) {
    if (!["go-host", "browser", "gpu-process"].includes(sample.role) && !String(sample.role).startsWith("renderer")) continue;
    const key = `${sample.role}:${sample.pid}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(sample);
  }
  const minimumSamples = input.memoryDiagnostic === true
    ? 10
    : Number(input.durationMinutes) >= 60 ? 45 : 15;
  const slopes = [];
  const foundRoles = new Set();
  let pass = true;
  for (const [key, samples] of groups) {
    samples.sort((left, right) => Date.parse(left.timestamp) - Date.parse(right.timestamp));
    const role = String(samples[0]?.role ?? "");
    foundRoles.add(role.startsWith("renderer") ? "renderer" : role);
    const slope = linearSlopeMiBPerHour(samples);
    const limit = role === "gpu-process" ? 10 : 5;
    const valid = samples.length >= minimumSamples && slope !== null && slope <= limit;
    pass &&= valid;
    slopes.push({key, samples: samples.length, slopeMiBPerHour: slope, limitMiBPerHour: limit, status: valid ? "pass" : "fail"});
  }
  for (const role of REQUIRED_SAMPLE_ROLES) pass &&= foundRoles.has(role);
  pass &&= foundRoles.has("renderer");

  const totalsByTimestamp = new Map();
  for (const sample of input.samples ?? []) {
    if (!["go-host", "browser", "gpu-process"].includes(sample.role) && !String(sample.role).startsWith("renderer")) continue;
    totalsByTimestamp.set(sample.timestamp, (totalsByTimestamp.get(sample.timestamp) ?? 0) + Number(sample.privateBytes));
  }
  const totalSamples = [...totalsByTimestamp].map(([timestamp, privateBytes]) => ({timestamp, privateBytes}));
  const totalSlope = linearSlopeMiBPerHour(totalSamples);
  const totalPass = totalSamples.length >= minimumSamples && totalSlope !== null && totalSlope <= 15;
  pass &&= totalPass;
  return result(pass ? "pass" : "fail", `pendiente total ${formatNumber(totalSlope)} MiB/h`, {
    minimumSamples,
    total: {samples: totalSamples.length, slopeMiBPerHour: totalSlope, limitMiBPerHour: 15, status: totalPass ? "pass" : "fail"},
    processes: slopes,
  });
}

function transportEvidence(input) {
  const windows = new Map();
  const observations = [];
  const expected = EXPECTED_WINDOWS[input.session] ?? [];
  const declaredEncoding = typeof input.expectedWindows === "string" ? "legacy-scalar" : "array";
  const declared = typeof input.expectedWindows === "string"
    ? [input.expectedWindows]
    : Array.isArray(input.expectedWindows) ? input.expectedWindows : [];
  const declaredValid = declared.length === expected.length && expected.every((kind, index) => declared[index] === kind);
  const observedKinds = new Set();
  let missingPull = 0;
  for (const checkpoint of input.diagnostics ?? []) {
    for (const target of checkpoint.targets ?? []) {
      const surface = targetSurface(target);
      const kind = expectedKind(surface);
      if (!expected.includes(kind)) continue;
      observedKinds.add(kind);
      const pull = target.diagnostics?.pull;
      const key = targetKey(target);
      const hasShadow = target.diagnostics != null
        && Object.prototype.hasOwnProperty.call(target.diagnostics, "shadow");
      observations.push({
        capturedAt: checkpoint.capturedAt,
        key,
        surface,
        pull,
        shadow: hasShadow ? target.diagnostics.shadow : undefined,
      });
      if (!pull) {
        missingPull += 1;
      } else {
        if (!windows.has(key)) windows.set(key, []);
        windows.get(key).push({capturedAt: checkpoint.capturedAt, ...pull});
      }
    }
  }
  const missingKinds = expected.filter((kind) => !observedKinds.has(kind));
  return {windows, observations, expected, declared, declaredEncoding, declaredValid, missingKinds, missingPull};
}

function transportCompletenessDetail(evidence) {
  const declarations = evidence.declaredValid
    ? `declaración ${evidence.declaredEncoding}${evidence.declaredEncoding === "legacy-scalar" ? " normalizada" : " válida"}`
    : `declaradas [${evidence.declared.join(", ")}], esperadas [${evidence.expected.join(", ")}]`;
  const classes = evidence.missingKinds.length === 0
    ? `clases ${evidence.expected.length}/${evidence.expected.length}`
    : `faltan clases [${evidence.missingKinds.join(", ")}]`;
  const pulls = evidence.missingPull === 0
    ? `pull presente en ${evidence.observations.length}/${evidence.observations.length} checkpoints`
    : `pull ausente en ${evidence.missingPull} checkpoint${evidence.missingPull === 1 ? "" : "s"}`;
  return `${declarations}; ${classes}; ${pulls}`;
}

function windowsCriterion(evidence) {
  const pass = evidence.declaredValid && evidence.missingKinds.length === 0 && evidence.missingPull === 0;
  return result(pass ? "pass" : "fail", transportCompletenessDetail(evidence), {
    expected: evidence.expected,
    missing: evidence.missingKinds,
    declaredValid: evidence.declaredValid,
  });
}

function deliveryCriterion(input, evidence) {
  const {windows} = evidence;
  let pass = evidence.declaredValid && evidence.missingKinds.length === 0 && evidence.missingPull === 0 && windows.size > 0;
  let maxP99 = 0;
  let maxDuration = 0;
  const details = [];
  for (const [window, series] of windows) {
    let progresses = series.length >= 2;
    for (let index = 1; index < series.length; index += 1) {
      progresses &&= Number(series[index].receivedV2Snapshots) > Number(series[index - 1].receivedV2Snapshots);
    }
    const windowP99 = Math.max(0, ...series.map(({requestDurationMs}) => Number(requestDurationMs?.p99 ?? Infinity)));
    const windowMax = Math.max(0, ...series.map(({requestDurationMs}) => Number(requestDurationMs?.max ?? Infinity)));
    maxP99 = Math.max(maxP99, windowP99);
    maxDuration = Math.max(maxDuration, windowMax);
    const valid = progresses && windowP99 <= 250 && windowMax <= 5_000;
    pass &&= valid;
    details.push({window, checkpoints: series.length, progresses, p99Ms: windowP99, maxMs: windowMax, status: valid ? "pass" : "fail"});
  }
  return result(
    pass ? "pass" : "fail",
    `p99 ${formatNumber(maxP99)} ms (límite p99 250 ms); max ${formatNumber(maxDuration)} ms (límite 5000 ms); precondiciones transporte ${evidence.declaredValid && evidence.missingKinds.length === 0 && evidence.missingPull === 0 ? "PASS" : "FAIL"}`,
    {windows: details},
  );
}

function phaseCriterion(input, windows) {
  const evidence = windows;
  if (input.phase === "off") {
    const received = Math.max(0, ...evidence.observations.map(({pull}) => Number(pull?.receivedV1Projections ?? Infinity)));
    const activeShadows = evidence.observations.filter(({shadow}) => shadow !== null && shadow !== undefined).length;
    const missingShadows = evidence.observations.filter(({shadow}) => shadow === undefined).length;
    const complete = evidence.declaredValid && evidence.missingKinds.length === 0 && evidence.missingPull === 0 && evidence.observations.length > 0;
    const pass = complete && received === 0 && activeShadows === 0 && missingShadows === 0;
    return {
      v1Off: result(
        pass ? "pass" : "fail",
        `V1 máximo ${formatNumber(received)} (exige 0); shadow activos ${activeShadows}, ausentes ${missingShadows} (exige null en ${evidence.observations.length}/${evidence.observations.length}); precondiciones transporte ${complete ? "PASS" : "FAIL"}`,
      ),
      shadowOn: result("not-applicable", "fase OFF"),
    };
  }
  const byWindow = new Map();
  for (const observation of evidence.observations) {
    if (!byWindow.has(observation.key)) byWindow.set(observation.key, []);
    byWindow.get(observation.key).push(observation);
  }
  let pass = evidence.declaredValid && evidence.missingKinds.length === 0 && evidence.missingPull === 0 && byWindow.size > 0;
  let frames = 0;
  let mismatches = 0;
  const metrics = {};
  const details = [];
  for (const [window, observations] of byWindow) {
    const shadows = observations.map(({shadow}) => shadow);
    const shadowPresent = shadows.every((shadow) => shadow !== null && shadow !== undefined);
    const windowFrames = Math.max(0, ...shadows.map((shadow) => Number(shadow?.frames ?? 0)));
    const windowMismatches = Math.max(0, ...shadows.map((shadow) => Number(shadow?.mismatches ?? 0)));
    const windowMetrics = {};
    for (const shadow of shadows) {
      for (const [name, value] of Object.entries(shadow?.metrics ?? {})) {
        windowMetrics[name] = Math.max(windowMetrics[name] ?? 0, Number(value));
        metrics[name] = Math.max(metrics[name] ?? 0, Number(value));
      }
    }
    const valid = shadowPresent && windowFrames > 0 && windowMismatches === 0;
    pass &&= valid;
    frames = Math.max(frames, windowFrames);
    mismatches = Math.max(mismatches, windowMismatches);
    details.push({window, surface: observations[0]?.surface, checkpoints: observations.length, shadowPresent, frames: windowFrames, mismatches: windowMismatches, metrics: windowMetrics, status: valid ? "pass" : "fail"});
  }
  const validWindows = details.filter(({status}) => status === "pass").length;
  return {v1Off: result("not-applicable", "fase ON"), shadowOn: result(pass ? "pass" : "fail", `${validWindows}/${details.length} ventanas con paridad; ${mismatches} mismatches exactos`, {frames, mismatches, metrics, windows: details})};
}

function scenarioCriterion(input) {
  const transitions = input.transitions ?? [];
  if (input.session === "S4") {
    const cycleStarts = transitions.filter(({kind, from, to}) => kind === "source-state" && from === "live" && to !== "live");
    const cycles = cycleStarts.map((lost) => {
      const recovered = transitions.find((entry) => entry.kind === "source-state" && entry.window === lost.window && entry.to === "live" && Date.parse(entry.timestamp) > Date.parse(lost.timestamp));
      const mark = transitions.find((entry) => entry.kind === "human" && /reanudar|reiniciar|reconectar/i.test(String(entry.text ?? "")) && Date.parse(entry.timestamp) >= Date.parse(lost.timestamp) - 15_000 && (!recovered || Date.parse(entry.timestamp) <= Date.parse(recovered.timestamp)));
      const progress = mark ? transitions.find((entry) => entry.kind === "v2-progress" && entry.window === lost.window && Date.parse(entry.timestamp) >= Date.parse(mark.timestamp) && Number(entry.frameRevision) > Number(lost.frameRevision)) : undefined;
      const recoverySeconds = recovered && mark ? (Date.parse(recovered.timestamp) - Date.parse(mark.timestamp)) / 1_000 : Infinity;
      const progressSeconds = progress && mark ? (Date.parse(progress.timestamp) - Date.parse(mark.timestamp)) / 1_000 : Infinity;
      const valid = Boolean(mark && recovered && progress) && recoverySeconds >= 0 && recoverySeconds <= 30 && progressSeconds <= 30;
      return {window: lost.window, lostAt: lost.timestamp, markAt: mark?.timestamp, recoveredAt: recovered?.timestamp, progressAt: progress?.timestamp, recoverySeconds, progressSeconds, status: valid ? "pass" : "fail"};
    });
    const pass = cycles.length > 0 && cycles.every(({status}) => status === "pass");
    return result(pass ? "pass" : "fail", `${cycles.filter(({status}) => status === "pass").length}/${cycles.length} ciclos recuperados con avance V2`, {cycles});
  }
  if (input.session === "S5") {
    const openings = transitions.filter((entry) => entry.kind === "human" && /abrir|apertura/i.test(String(entry.text ?? ""))).map((entry) => ({
      ...entry,
      expected: /desktop/i.test(String(entry.text ?? "")) ? "desktop" : /studio|obs/i.test(String(entry.text ?? "")) ? "studio-or-obs" : "unknown",
    }));
    const firstSeen = transitions.filter(({kind}) => kind === "window-first-seen");
    const ready = transitions.filter(({kind}) => kind === "window-widget-ready");
    let pass = ["desktop", "studio-or-obs"].every((kind) => openings.some(({expected}) => expected === kind));
    const latencies = openings.map((opening) => {
      const seen = firstSeen.find((entry) => expectedKind(entry.surface) === opening.expected && Date.parse(entry.timestamp) >= Date.parse(opening.timestamp));
      const widget = seen ? ready.find((entry) => entry.window === seen.window && expectedKind(entry.surface) === opening.expected && Date.parse(entry.timestamp) >= Date.parse(seen.timestamp)) : undefined;
      const firstSeenSeconds = seen ? (Date.parse(seen.timestamp) - Date.parse(opening.timestamp)) / 1_000 : Infinity;
      const widgetReadySeconds = widget ? (Date.parse(widget.timestamp) - Date.parse(opening.timestamp)) / 1_000 : Infinity;
      pass &&= firstSeenSeconds <= 5 && widgetReadySeconds <= 10;
      return {text: opening.text, expected: opening.expected, window: seen?.window, firstSeenSeconds, widgetReadySeconds};
    });
    return result(pass ? "pass" : "fail", `${openings.filter(({expected}) => expected !== "unknown").length}/2 aperturas previstas`, {latencies});
  }
  return result("not-applicable", "sin criterio de transición específico");
}

function summarizeSession(input) {
  const transport = transportEvidence(input);
  const phase = phaseCriterion(input, transport);
  const elapsedMinutes = (Date.parse(input.endedAt) - Date.parse(input.startedAt)) / 60_000;
  const criteria = {
    capture: result(input.failure ? "fail" : "pass", input.failure ?? "captura completada"),
    metadata: result(/^[a-f\d]{64}$/i.test(input.executable?.sha256 ?? "") && /^[a-f\d]{64}$/i.test(input.executable?.distSha256 ?? "") && input.executable?.stable === true && input.executable.sha256 === input.executable.sha256End && input.executable.distSha256 === input.executable.distSha256End && Number(input.scene?.cars) > 0 ? "pass" : "fail", `${input.scene?.description ?? "sin escena"}; ${input.scene?.cars ?? 0} coches; build ${input.executable?.stable === true ? "estable" : "cambió"}`),
    duration: result(elapsedMinutes >= Number(input.durationMinutes) - 0.1 ? "pass" : "fail", `${formatNumber(elapsedMinutes)} min medidos`),
    hygiene: result((input.hygiene?.foreign ?? []).length === 0 ? "pass" : "fail", `${input.hygiene?.foreign?.length ?? 0} procesos bloqueantes`),
    windows: windowsCriterion(transport),
    v1Off: phase.v1Off,
    shadowOn: phase.shadowOn,
    delivery: deliveryCriterion(input, transport),
    memory: memoryCriterion(input),
    scenario: scenarioCriterion(input),
    screenshots: result((input.screenshots?.initial?.length ?? 0) > 0 && (input.screenshots?.final?.length ?? 0) > 0 ? "pass" : "fail", `${input.screenshots?.initial?.length ?? 0} iniciales; ${input.screenshots?.final?.length ?? 0} finales`),
    shutdown: result(input.shutdownClean === true ? "pass" : "fail", input.shutdownClean === true ? "cierre limpio" : "cierre no confirmado"),
  };
  const verdict = Object.values(criteria).some(({status}) => status === "fail") ? "fail" : "pass";
  return {schema: "vantare.session.summary.v1", generatedAt: new Date().toISOString(), session: input.session, phase: input.phase, verdict, criteria};
}

function formatNumber(value) {
  return Number.isFinite(value) ? Number(value).toFixed(2) : "n/a";
}

async function session(name) {
  return JSON.parse(await readFile(new URL(`${name}/sesion.json`, import.meta.url), "utf8"));
}

async function csv(name) {
  const lines = (await readFile(new URL(`${name}/procesos.csv`, import.meta.url), "utf8"))
    .trim().split(/\r?\n/);
  const headers = parseCsvRow(lines.shift());
  return lines.map((line) => Object.fromEntries(
    headers.map((header, index) => [header, parseCsvRow(line)[index]]),
  ));
}

function parseCsvRow(line) {
  return line.slice(1, -1).split('\",\"').map((value) => value.replaceAll('\"\"', '\"'));
}

function slopeMiBPerHour(rows) {
  const origin = Date.parse(rows[0].timestamp);
  const points = rows.map((row) => ({
    x: (Date.parse(row.timestamp) - origin) / 3_600_000,
    y: Number(row.privateBytes) / MIB,
  }));
  const meanX = points.reduce((sum, point) => sum + point.x, 0) / points.length;
  const meanY = points.reduce((sum, point) => sum + point.y, 0) / points.length;
  const variance = points.reduce((sum, point) => sum + (point.x - meanX) ** 2, 0);
  return points.reduce(
    (sum, point) => sum + (point.x - meanX) * (point.y - meanY),
    0,
  ) / variance;
}

async function rendererSlopeAfterWarmup(name) {
  const groups = new Map();
  for (const row of await csv(name)) {
    if (row.role !== "renderer-unassigned") continue;
    if (!groups.has(row.pid)) groups.set(row.pid, []);
    groups.get(row.pid).push(row);
  }
  return [...groups.values()].reduce(
    (sum, rows) => sum + slopeMiBPerHour(rows.slice(5)),
    0,
  );
}

async function assertPublishedSummary(name, recalculated) {
  const published = JSON.parse(await readFile(new URL(`${name}/resumen.json`, import.meta.url), "utf8"));
  assert.deepEqual(
    { ...recalculated, generatedAt: published.generatedAt },
    published,
    `${name}/resumen.json no coincide con sesion.json`,
  );
}

const on = summarizeSession(await session("on"));
const off = summarizeSession(await session("off"));
const isolated = summarizeSession(await session("cdp-isolation-off"));
const pollingSlope = await rendererSlopeAfterWarmup("off");
const isolatedSlope = await rendererSlopeAfterWarmup("cdp-isolation-off");
const reductionPct = (1 - isolatedSlope / pollingSlope) * 100;

await assertPublishedSummary("on", on);
await assertPublishedSummary("off", off);
await assertPublishedSummary("cdp-isolation-off", isolated);

assert.equal(on.criteria.shadowOn.frames, 6074);
assert.equal(on.criteria.shadowOn.mismatches, 0);
assert.equal(off.criteria.v1Off.status, "pass");
assert.match(off.criteria.v1Off.detail, /V1 máximo 0\.00/);
assert.match(off.criteria.v1Off.detail, /null en 5\/5/);
assert.equal(Number(on.criteria.delivery.windows[0].p99Ms.toFixed(1)), 67.6);
assert.equal(Number(off.criteria.delivery.windows[0].p99Ms.toFixed(1)), 49.1);
assert.equal(Number(reductionPct.toFixed(1)), 75.0);

process.stdout.write(`${JSON.stringify({
  on: {
    frames: on.criteria.shadowOn.frames,
    exactMismatches: on.criteria.shadowOn.mismatches,
    deliveryP99Ms: on.criteria.delivery.windows[0].p99Ms,
  },
  off: {
    v1: 0,
    shadowNullCheckpoints: "5/5",
    deliveryP99Ms: off.criteria.delivery.windows[0].p99Ms,
  },
  cdpIsolation: {
    pollingRendererSlopeAfterWarmupMiBPerHour: pollingSlope,
    isolatedRendererSlopeAfterWarmupMiBPerHour: isolatedSlope,
    reductionPct,
    deliveryP99Ms: isolated.criteria.delivery.windows[0].p99Ms,
  },
}, null, 2)}\n`);
