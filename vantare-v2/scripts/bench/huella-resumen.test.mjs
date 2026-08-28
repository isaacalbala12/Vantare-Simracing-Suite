import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { aggregateRuns, parseCsv, presentMonV2Frame, renderMarkdown, summarizeRun } from "./huella-resumen.mjs";

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

test("N=1 es insuficiente aunque el ruido calculado sea cero", () => {
  const entry = aggregateRuns([{ "go-host": { cpuPct: { mean: 100 } } }])[0];
  assert.equal(entry.noisePct, 0);
  assert.equal(entry.pass, false);
  assert.equal(entry.status, "INSUFICIENTE / NO PUBLICABLE");
});

test("N=3 habilita el gate y tres corridas iguales pasan", () => {
  const entry = aggregateRuns([100, 100, 100].map((mean) => ({ "go-host": { cpuPct: { mean } } })))[0];
  assert.equal(entry.runs, 3);
  assert.equal(entry.noisePct, 0);
  assert.equal(entry.pass, true);
  assert.equal(entry.status, "✓");
});

test("tres ceros son estables y no producen división inválida", () => {
  const entry = aggregateRuns([0, 0, 0].map((mean) => ({ "go-host": { gpuPct: { mean } } })))[0];
  assert.equal(entry.noisePct, 0);
  assert.equal(entry.pass, true);
});

test("rechaza una corrida marcada como no publicable", () => {
  const run = summarizeRun(parseCsv("timestamp,role,cpuPct,publishable,hygieneForced,foreignProcesses\nt1,go-host,1,false,true,msedge.exe:42\n"));
  assert.throws(() => aggregateRuns([run, run, run]), /no publicables.*1, 2, 3/i);
  const markdown = renderMarkdown("A1", [], ["run.csv"], [run]);
  assert.match(markdown, /NO PUBLICABLE/);
  assert.match(markdown, /hygieneForced=true/);
  assert.match(markdown, /msedge\.exe:42/);
});

test("publica conteo y rutas de WebView2 permitidos del sistema", () => {
  const systemPath = String.raw`C:\Users\isaac\AppData\Local\Packages\MicrosoftWindows.Client.CBS_x\LocalState\EBWebView`;
  const pathsCsv = JSON.stringify([systemPath]).replaceAll('"', '""');
  const run = summarizeRun(parseCsv(`timestamp,role,cpuPct,publishable,systemWebView2Count,systemWebView2Paths\nt1,go-host,1,true,6,"${pathsCsv}"\n`));
  const markdown = renderMarkdown("A1", aggregateRuns([run, run, run]), ["a.csv", "b.csv", "c.csv"], [run, run, run]);
  assert.equal(run.__metadata.systemWebView2Count, 6);
  assert.match(markdown, /WebView2 del sistema permitidos/);
  assert.match(markdown, /MicrosoftWindows\.Client\.CBS_x/);
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

test("interpreta la disposición de display de PresentMon v2", async () => {
  const fixture = parseCsv(await readFile(new URL("testdata/presentmon-v2.csv", import.meta.url), "utf8"));
  assert.deepEqual(fixture.map(presentMonV2Frame), [
    { timestamp: "16.2337", frameTimeMs: 15.8548, dropped: 0 },
    { timestamp: "32.0885", frameTimeMs: 15.8422, dropped: 1 },
  ]);
});
