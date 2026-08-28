import assert from "node:assert/strict";
import test from "node:test";
import { aggregateRuns, parseCsv, summarizeRun } from "./huella-resumen.mjs";

test("agrega muestras por rol sin mezclar procesos", () => {
  const rows = parseCsv([
    "timestamp,role,privateBytes,cpuPct",
    "t1,go-host,100,2",
    "t2,go-host,120,4",
    "t1,renderer-overlay,200,8",
    "t2,renderer-overlay,220,10",
  ].join("\n"));
  const run = summarizeRun(rows);
  assert.equal(run["go-host"].privateBytes.mean, 110);
  assert.equal(run["renderer-overlay"].cpuPct.mean, 9);
  assert.equal(run["renderer-overlay"].privateBytes.p95, 220);
});

test("suma procesos del mismo rol antes de calcular la media temporal", () => {
  const run = summarizeRun(parseCsv([
    "timestamp,role,privateBytes,cpuPct",
    "t1,utility,100,1",
    "t1,utility,50,2",
    "t2,utility,120,3",
    "t2,utility,80,4",
  ].join("\n")));
  assert.equal(run.utility.privateBytes.mean, 175);
  assert.equal(run.utility.cpuPct.mean, 5);
});

test("marca ruido por encima de cinco por ciento", () => {
  const runs = [100, 102, 98].map((value) => ({ "go-host": { cpuPct: { mean: value } } }));
  const stable = aggregateRuns(runs)[0];
  assert.equal(stable.pass, true);
  assert.ok(stable.noisePct < 5);

  const noisy = aggregateRuns([100, 120, 80].map((value) => ({ "go-host": { cpuPct: { mean: value } } })))[0];
  assert.equal(noisy.pass, false);
  assert.ok(noisy.noisePct > 5);
});

test("agrega frametime del juego con percentiles observables", () => {
  const run = summarizeRun(parseCsv("timestamp,role,frameTimeMs\nt1,game,8\nt2,game,12\nt3,game,20\n"));
  assert.equal(run.game.frameTimeMs.p50, 12);
  assert.equal(run.game.frameTimeMs.p95, 20);
  assert.equal(run.game.frameTimeMs.p99, 20);
});

test("ignora celdas vacías en vez de convertirlas en ceros", () => {
  const run = summarizeRun(parseCsv("timestamp,role,privateBytes,frameTimeMs\nt1,game,,8.2\n"));
  assert.equal(run.game.privateBytes, undefined);
  assert.equal(run.game.frameTimeMs.mean, 8.2);
});
