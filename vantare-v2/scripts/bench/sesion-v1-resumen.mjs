import { readFile, writeFile } from "node:fs/promises";
import process from "node:process";
import { pathToFileURL } from "node:url";

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
  const minimumSamples = Number(input.durationMinutes) >= 60 ? 45 : 15;
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
  const declared = input.expectedWindows ?? [];
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
      observations.push({capturedAt: checkpoint.capturedAt, key, surface, pull, shadow: target.diagnostics?.shadow});
      if (!pull) {
        missingPull += 1;
      } else {
        if (!windows.has(key)) windows.set(key, []);
        windows.get(key).push({capturedAt: checkpoint.capturedAt, ...pull});
      }
    }
  }
  const missingKinds = expected.filter((kind) => !observedKinds.has(kind));
  return {windows, observations, expected, declaredValid, missingKinds, missingPull};
}

function windowsCriterion(evidence) {
  const pass = evidence.declaredValid && evidence.missingKinds.length === 0 && evidence.missingPull === 0;
  return result(pass ? "pass" : "fail", `${evidence.expected.length - evidence.missingKinds.length}/${evidence.expected.length} clases; ${evidence.missingPull} diagnósticos pull ausentes`, {
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
  return result(pass ? "pass" : "fail", `p99 ${formatNumber(maxP99)} ms; max ${formatNumber(maxDuration)} ms`, {windows: details});
}

function phaseCriterion(input, windows) {
  const evidence = windows;
  if (input.phase === "off") {
    const received = Math.max(0, ...evidence.observations.map(({pull}) => Number(pull?.receivedV1Projections ?? Infinity)));
    const shadowViolations = evidence.observations.filter(({shadow}) => shadow !== null).length;
    const complete = evidence.declaredValid && evidence.missingKinds.length === 0 && evidence.missingPull === 0 && evidence.observations.length > 0;
    const pass = complete && received === 0 && shadowViolations === 0;
    return {v1Off: result(pass ? "pass" : "fail", `${formatNumber(received)} proyecciones V1; ${shadowViolations} shadow activos o ausentes`), shadowOn: result("not-applicable", "fase OFF")};
  }
  let frames = 0;
  let mismatches = 0;
  const metrics = {};
  for (const checkpoint of input.diagnostics ?? []) {
    for (const target of checkpoint.targets ?? []) {
      const shadow = target.diagnostics?.shadow;
      if (!shadow) continue;
      frames = Math.max(frames, Number(shadow.frames ?? 0));
      mismatches = Math.max(mismatches, Number(shadow.mismatches ?? 0));
      for (const [name, value] of Object.entries(shadow.metrics ?? {})) metrics[name] = Math.max(metrics[name] ?? 0, Number(value));
    }
  }
  const pass = frames > 0 && mismatches === 0;
  return {v1Off: result("not-applicable", "fase ON"), shadowOn: result(pass ? "pass" : "fail", `${frames} frames; ${mismatches} mismatches exactos`, {frames, mismatches, metrics})};
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

export function summarizeSession(input) {
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

export function renderSessionMarkdown(summary) {
  const rows = Object.entries(summary.criteria).map(([name, criterion]) => `| ${name} | ${criterion.status.toUpperCase()} | ${criterion.detail} |`);
  return `# Resumen ${summary.session} · V1 ${summary.phase.toUpperCase()}\n\nVeredicto: ${summary.verdict.toUpperCase()}\n\n| Criterio | Estado | Evidencia |\n| --- | --- | --- |\n${rows.join("\n")}\n`;
}

async function main() {
  const argument = (name) => {
    const index = process.argv.indexOf(`--${name}`);
    return index >= 0 ? process.argv[index + 1] : undefined;
  };
  const inputPath = argument("input");
  const jsonPath = argument("json");
  const markdownPath = argument("markdown");
  if (!inputPath || !jsonPath || !markdownPath) throw new Error("usage: node sesion-v1-resumen.mjs --input session.json --json resumen.json --markdown resumen.md");
  const summary = summarizeSession(JSON.parse(await readFile(inputPath, "utf8")));
  await writeFile(jsonPath, `${JSON.stringify(summary, null, 2)}\n`, {encoding: "utf8", flag: "wx"});
  await writeFile(markdownPath, renderSessionMarkdown(summary), {encoding: "utf8", flag: "wx"});
  process.stdout.write(`${JSON.stringify(summary)}\n`);
  if (summary.verdict !== "pass") process.exitCode = 2;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) await main();
