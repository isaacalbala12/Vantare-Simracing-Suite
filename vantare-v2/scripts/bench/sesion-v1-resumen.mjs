import { readFile, writeFile } from "node:fs/promises";
import process from "node:process";
import { pathToFileURL } from "node:url";

const MIB = 1024 * 1024;
const REQUIRED_SAMPLE_ROLES = new Set(["go-host", "browser", "gpu-process"]);

function result(status, detail, evidence = {}) {
  return {status, detail, ...evidence};
}

function targetKey(target) {
  return `${target.role ?? "unknown"}|${target.url ?? ""}|${target.title ?? ""}`;
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
  for (const checkpoint of input.diagnostics ?? []) {
    for (const target of checkpoint.targets ?? []) {
      const pull = target.diagnostics?.pull;
      if (!pull) continue;
      const key = targetKey(target);
      if (!windows.has(key)) windows.set(key, []);
      windows.get(key).push({capturedAt: checkpoint.capturedAt, ...pull});
    }
  }
  return windows;
}

function deliveryCriterion(input, windows) {
  let pass = windows.size > 0;
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
  if (input.phase === "off") {
    const received = Math.max(0, ...[...windows.values()].flatMap((series) => series.map(({receivedV1Projections}) => Number(receivedV1Projections ?? 0))));
    return {v1Off: result(received === 0 ? "pass" : "fail", `${received} proyecciones V1 recibidas`), shadowOn: result("not-applicable", "fase OFF")};
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
    const recovered = transitions.filter(({kind, to}) => kind === "source-state" && to === "live");
    const nonLive = transitions.filter(({kind, to}) => kind === "source-state" && to !== "live");
    let recoverySeconds = Infinity;
    for (const lost of nonLive) {
      const next = recovered.find((entry) => Date.parse(entry.timestamp) > Date.parse(lost.timestamp));
      if (next) recoverySeconds = Math.min(recoverySeconds, (Date.parse(next.timestamp) - Date.parse(lost.timestamp)) / 1_000);
    }
    return result(Number.isFinite(recoverySeconds) && recoverySeconds <= 30 ? "pass" : "fail", `recovery ${formatNumber(recoverySeconds)} s`);
  }
  if (input.session === "S5") {
    const openings = transitions.filter((entry) => entry.kind === "human" && /abrir|apertura/i.test(String(entry.text ?? "")));
    const firstSeen = transitions.filter(({kind}) => kind === "window-first-seen");
    const ready = transitions.filter(({kind}) => kind === "window-widget-ready");
    let pass = openings.length > 0;
    const latencies = openings.map((opening) => {
      const seen = firstSeen.find((entry) => Date.parse(entry.timestamp) >= Date.parse(opening.timestamp));
      const widget = ready.find((entry) => Date.parse(entry.timestamp) >= Date.parse(opening.timestamp));
      const firstSeenSeconds = seen ? (Date.parse(seen.timestamp) - Date.parse(opening.timestamp)) / 1_000 : Infinity;
      const widgetReadySeconds = widget ? (Date.parse(widget.timestamp) - Date.parse(opening.timestamp)) / 1_000 : Infinity;
      pass &&= firstSeenSeconds <= 5 && widgetReadySeconds <= 10;
      return {text: opening.text, firstSeenSeconds, widgetReadySeconds};
    });
    return result(pass ? "pass" : "fail", `${openings.length} aperturas tardías`, {latencies});
  }
  return result("not-applicable", "sin criterio de transición específico");
}

export function summarizeSession(input) {
  const windows = transportEvidence(input);
  const phase = phaseCriterion(input, windows);
  const elapsedMinutes = (Date.parse(input.endedAt) - Date.parse(input.startedAt)) / 60_000;
  const criteria = {
    capture: result(input.failure ? "fail" : "pass", input.failure ?? "captura completada"),
    metadata: result(/^[a-f\d]{64}$/i.test(input.executable?.sha256 ?? "") && /^[a-f\d]{64}$/i.test(input.executable?.distSha256 ?? "") && input.executable?.stable === true && input.executable.sha256 === input.executable.sha256End && input.executable.distSha256 === input.executable.distSha256End && Number(input.scene?.cars) > 0 ? "pass" : "fail", `${input.scene?.description ?? "sin escena"}; ${input.scene?.cars ?? 0} coches; build ${input.executable?.stable === true ? "estable" : "cambió"}`),
    duration: result(elapsedMinutes >= Number(input.durationMinutes) - 0.1 ? "pass" : "fail", `${formatNumber(elapsedMinutes)} min medidos`),
    hygiene: result((input.hygiene?.foreign ?? []).length === 0 ? "pass" : "fail", `${input.hygiene?.foreign?.length ?? 0} procesos bloqueantes`),
    v1Off: phase.v1Off,
    shadowOn: phase.shadowOn,
    delivery: deliveryCriterion(input, windows),
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
