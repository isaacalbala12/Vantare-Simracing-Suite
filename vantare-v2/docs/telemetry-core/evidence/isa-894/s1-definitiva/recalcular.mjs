import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { summarizeSession } from "../../../../../scripts/bench/sesion-v1-resumen.mjs";

const MIB = 1024 * 1024;

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
