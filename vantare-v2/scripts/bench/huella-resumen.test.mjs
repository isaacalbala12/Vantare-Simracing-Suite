import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { aggregateRuns, compareRuns, parseCsv, presentMonV2Frame, renderComparison, renderMarkdown, summarizeRun } from "./huella-resumen.mjs";

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

test("rechaza agregar corridas producidas por builds distintos", () => {
  const runA = summarizeRun(parseCsv("timestamp,role,cpuPct,buildSha256,distSha256,buildStable,scene,lmuSession,cars\nt1,go-host,1,aaaaaaaa,dist-1,true,Spa garage,practice,20\n"));
  const runB = summarizeRun(parseCsv("timestamp,role,cpuPct,buildSha256,distSha256,buildStable,scene,lmuSession,cars\nt1,go-host,1,bbbbbbbb,dist-2,true,Spa garage,practice,20\n"));
  assert.throws(() => aggregateRuns([runA, runA, runB]), /builds distintos/i);
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

test("excluye de las medias GPU las muestras marcadas como inválidas", () => {
  const run = summarizeRun(parseCsv([
    "timestamp,role,gpuPct,gpuDedicatedBytes,gpuSampleValid",
    "t1,renderer-overlay,999,999999999,false",
    "t2,renderer-overlay,12.5,104857600,true",
  ].join("\n")));
  assert.equal(run["renderer-overlay"].gpuPct.mean, 12.5);
  assert.equal(run["renderer-overlay"].gpuPct.samples, 1);
  assert.equal(run["renderer-overlay"].gpuDedicatedBytes.mean, 104857600);
});

test("un CSV sin frametime válido conserva recursos pero no publica juego", () => {
  const stopped = JSON.stringify(["VantareHuella-18440-20260828-231501"]).replaceAll('"', '""');
  const run = summarizeRun(parseCsv([
    "timestamp,role,cpuPct,frameTimeMs,gameFrametimeValid,orphanEtwSessionsStopped",
    `t1,go-host,2,,false,"${stopped}"`,
    `t2,game,,16.6,false,"${stopped}"`,
  ].join("\n")));
  assert.equal(run["go-host"].cpuPct.mean, 2);
  assert.equal(run.game.frameTimeMs, undefined);
  assert.equal(run.__metadata.gameFrametimeValid, false);
  assert.deepEqual(run.__metadata.orphanEtwSessionsStopped, ["VantareHuella-18440-20260828-231501"]);

  const markdown = renderMarkdown("A1", [], ["run.csv"], [run]);
  assert.match(markdown, /FRAMETIME NO PUBLICABLE/);
  assert.match(markdown, /RAM\/CPU\/GPU.*siguen siendo publicables/);
  assert.match(markdown, /VantareHuella-18440-20260828-231501/);
});

test("interpreta la disposición de display de PresentMon v2", async () => {
  const fixture = parseCsv(await readFile(new URL("testdata/presentmon-v2.csv", import.meta.url), "utf8"));
  assert.deepEqual(fixture.map(presentMonV2Frame), [
    { timestamp: "16.2337", frameTimeMs: 15.8548, dropped: 0 },
    { timestamp: "32.0885", frameTimeMs: 15.8422, dropped: 1 },
  ]);
});

test("la tabla de pérdidas etiqueta el total sin llamarlo presentado", () => {
  const run = summarizeRun(parseCsv("timestamp,role,dropped\nt1,game,0\nt2,game,1\n"));
  const markdown = renderMarkdown("A1", [], ["run.csv"], [run]);
  assert.match(markdown, /\| Perdidos \| Frames totales \| Porcentaje \|/);
  assert.doesNotMatch(markdown, /\| Perdidos \| Presentados \|/);
});

test("el banco limita el muestreo de procesos por tiempo de pared", async () => {
  const script = await readFile(new URL("huella.ps1", import.meta.url), "utf8");
  assert.match(script, /AddSeconds\(\$Duracion\)/);
  assert.match(script, /while \(\(Get-Date\) -lt \$sampleDeadline\)/);
  assert.doesNotMatch(script, /for \(\$sampleIndex = 0; \$sampleIndex -lt \$Duracion/);
});

// Bloque de frame time: n frames que valen ms; siempre el mismo build.
const block = (condition, ms) => ({
  condition,
  run: summarizeRun(parseCsv(["timestamp,role,frameTimeMs,dropped,buildSha256,distSha256",
    ...ms.map((value, index) => `t${index},game,${value},0,sha,dist`)].join("\n"))),
});

test("compara A0/A1 intercalado: distingue un efecto mayor que el ruido A/A", () => {
  const blocks = [block("A0", [10, 10]), block("A1", [12, 12]), block("A1", [12.1, 12.1]), block("A0", [10.1, 10.1]), block("A0", [9.9, 9.9]), block("A1", [11.9, 11.9])];
  const mean = compareRuns(blocks, ["A0", "A1"], { sameBuild: true }).find((entry) => entry.stat === "mean" && entry.metric === "frameTimeMs");
  assert.equal(mean.base.runs, 3);
  assert.ok(Math.abs(mean.delta - 2) < 1e-9);
  assert.equal(mean.status, "DISTINGUIBLE");
  assert.match(renderComparison(["A0", "A1"], [mean], blocks.map((entry, index) => ({ ...entry, file: `b${index}.csv` }))), /DISTINGUIBLE/);
});

test("compara A0/A1: el ruido A/A alto deja el efecto dentro del ruido y pocos bloques es insuficiente", () => {
  const noisy = [block("A0", [8, 8]), block("A1", [10, 10]), block("A1", [6, 6]), block("A0", [12, 12]), block("A0", [10, 10]), block("A1", [8, 8])];
  assert.equal(compareRuns(noisy, ["A0", "A1"]).find((entry) => entry.stat === "mean").status, "DENTRO DEL RUIDO");
  assert.equal(compareRuns(noisy.slice(0, 4), ["A0", "A1"]).find((entry) => entry.stat === "mean").status, "INSUFICIENTE");
});

test("compareRuns rechaza builds distintos con sameBuild y solo saca percentiles del frame time", () => {
  const other = block("A1", [1]);
  other.run.__metadata.buildSha256 = "otro";
  assert.throws(() => compareRuns([block("A0", [1]), other], ["A0", "A1"], { sameBuild: true }), /builds distintos/);
  const stats = compareRuns([block("A0", [1]), block("A1", [2])], ["A0", "A1"]).map((entry) => `${entry.metric}:${entry.stat}`);
  assert.deepEqual(stats, ["frameTimeMs:mean", "dropped:mean", "frameTimeMs:p50", "frameTimeMs:p95", "frameTimeMs:p99"]);
});

test("la CLI --compare lee la condición de cada CSV y escribe la comparación", async () => {
  const { mkdtemp, writeFile, readFile: read, rm } = await import("node:fs/promises");
  const { execFileSync } = await import("node:child_process");
  const { tmpdir } = await import("node:os");
  const dir = await mkdtemp(path.join(tmpdir(), "huella-compare-"));
  try {
    const files = [["A0", 10], ["A1", 12], ["A1", 12.1], ["A0", 10.1], ["A0", 9.9], ["A1", 11.9]].map(([condition, ms], index) => {
      const file = path.join(dir, `b${index}.csv`);
      return writeFile(file, `timestamp,condition,role,frameTimeMs,dropped\nt1,${condition},game,${ms},0\nt2,${condition},game,${ms},0\n`).then(() => file);
    });
    const csvs = await Promise.all(files);
    const output = path.join(dir, "out.md");
    execFileSync("node", [fileURLToPath(new URL("huella-resumen.mjs", import.meta.url)), "--compare", "A0,A1", "--output", output, ...csvs]);
    assert.match(await read(output, "utf8"), /# Huella mínima · A0 vs A1[\s\S]*frameTimeMs \| mean[\s\S]*DISTINGUIBLE/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
