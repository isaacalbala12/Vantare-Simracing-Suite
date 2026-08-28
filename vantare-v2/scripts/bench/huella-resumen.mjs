import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

export const MIN_PUBLISHABLE_RUNS = 3;
export const METRICS = ["privateBytes", "workingSetBytes", "cpuPct", "gpuPct", "gpuDedicatedBytes", "frameTimeMs", "dropped"];

export function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

export function standardDeviation(values) {
  if (values.length < 2) return 0;
  const average = mean(values);
  return Math.sqrt(values.reduce((sum, value) => sum + (value - average) ** 2, 0) / (values.length - 1));
}

export function percentile(values, ratio) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1));
  return sorted[index];
}

export function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  const parseLine = (line) => {
    const values = [];
    let current = "";
    let quoted = false;
    for (let index = 0; index < line.length; index += 1) {
      const character = line[index];
      if (character === '"' && quoted && line[index + 1] === '"') { current += '"'; index += 1; }
      else if (character === '"') quoted = !quoted;
      else if (character === "," && !quoted) { values.push(current); current = ""; }
      else current += character;
    }
    values.push(current);
    return values;
  };
  const headers = parseLine(lines[0]);
  return lines.slice(1).map((line) => Object.fromEntries(headers.map((header, index) => [header, parseLine(line)[index] ?? ""])));
}

export function presentMonV2Frame(row) {
  if (!("FrameTime" in row) || !("DisplayedTime" in row)) {
    throw new Error("PresentMon v2 requiere las columnas FrameTime y DisplayedTime");
  }
  const frameTimeMs = Number(row.FrameTime);
  if (!Number.isFinite(frameTimeMs)) return null;
  const displayedTime = String(row.DisplayedTime ?? "").trim();
  return {
    timestamp: String(row.CPUStartTime ?? ""),
    frameTimeMs,
    // PresentMon v2 escribe NA en DisplayLatency y DisplayedTime cuando el
    // frame presentado no alcanzó la pantalla (mMsDisplayedTime == 0).
    dropped: displayedTime.toUpperCase() === "NA" ? 1 : 0,
  };
}

export function summarizeRun(rows) {
  const metadata = {
    publishable: !rows.some((row) => String(row.publishable ?? "true").toLowerCase() === "false"),
    hygieneForced: rows.some((row) => String(row.hygieneForced ?? "false").toLowerCase() === "true"),
    foreignProcesses: [...new Set(rows.map((row) => String(row.foreignProcesses ?? "").trim()).filter(Boolean))],
    systemWebView2Count: Math.max(0, ...rows.map((row) => Number(row.systemWebView2Count)).filter(Number.isFinite)),
    systemWebView2Paths: [...new Set(rows.map((row) => String(row.systemWebView2Paths ?? "").trim()).filter(Boolean))],
  };
  const groups = Map.groupBy(rows.filter((row) => row.role), (row) => row.role);
  const run = Object.fromEntries([...groups].map(([role, roleRows]) => {
    const samples = [...Map.groupBy(roleRows, (row) => row.timestamp).values()].map((sameTimestamp) =>
      Object.fromEntries(METRICS.map((metric) => {
      const values = sameTimestamp
        .map((row) => String(row[metric] ?? "").trim())
        .filter((value) => value !== "")
        .map(Number)
        .filter(Number.isFinite);
        return [metric, values.length ? values.reduce((sum, value) => sum + value, 0) : null];
      })),
    );
    const metrics = {};
    for (const metric of METRICS) {
      const values = samples.map((sample) => sample[metric]).filter(Number.isFinite);
      if (!values.length) continue;
      metrics[metric] = {
        mean: mean(values),
        sum: values.reduce((sum, value) => sum + value, 0),
        samples: values.length,
        p50: percentile(values, 0.50),
        p95: percentile(values, 0.95),
        p99: percentile(values, 0.99),
        max: Math.max(...values),
      };
    }
    return [role, metrics];
  }));
  Object.defineProperty(run, "__metadata", { value: metadata, enumerable: false });
  return run;
}

export function aggregateRuns(runs) {
  const rejected = runs.flatMap((run, index) => run.__metadata?.publishable === false ? [index + 1] : []);
  if (rejected.length) {
    throw new Error(`Corridas no publicables por higiene forzada: ${rejected.join(", ")}`);
  }
  const roles = new Set(runs.flatMap((run) => Object.keys(run)));
  return [...roles].flatMap((role) => METRICS.flatMap((metric) => {
    const values = runs.map((run) => run[role]?.[metric]?.mean).filter(Number.isFinite);
    if (!values.length) return [];
    const average = mean(values);
    const deviation = standardDeviation(values);
    const noisePct = average === 0 ? (deviation === 0 ? 0 : Infinity) : Math.abs(deviation / average) * 100;
    const enoughRuns = values.length >= MIN_PUBLISHABLE_RUNS;
    return [{
      role, metric, runs: values.length, mean: average, deviation, noisePct,
      pass: enoughRuns && noisePct <= 5,
      status: enoughRuns ? (noisePct <= 5 ? "✓" : "✗") : "INSUFICIENTE / NO PUBLICABLE",
    }];
  }));
}

function displayValue(metric, value) {
  if (!Number.isFinite(value)) return "—";
  if (/Bytes$/.test(metric)) return `${(value / 1024 / 1024).toFixed(2)} MiB`;
  if (metric === "frameTimeMs") return `${value.toFixed(3)} ms`;
  if (metric === "dropped") return `${(value * 100).toFixed(3)} %`;
  return value.toFixed(3);
}

export function renderMarkdown(condition, aggregate, files, runs = []) {
  const rows = aggregate.map((entry) =>
    `| ${condition} | ${entry.role} | ${entry.metric} | ${entry.runs} | ${displayValue(entry.metric, entry.mean)} | ${displayValue(entry.metric, entry.deviation)} | ${Number.isFinite(entry.noisePct) ? entry.noisePct.toFixed(2) : "∞"} % | ${entry.status} |`,
  );
  const runRows = runs.flatMap((run, index) => Object.entries(run).flatMap(([role, metrics]) =>
    Object.entries(metrics).map(([metric, summary]) =>
      `| ${index + 1} | ${role} | ${metric} | ${displayValue(metric, summary.mean)} | ${displayValue(metric, summary.p50)} | ${displayValue(metric, summary.p95)} | ${displayValue(metric, summary.p99)} | ${displayValue(metric, summary.max)} |`,
    ),
  ));
  const forcedRuns = runs.flatMap((run, index) => run.__metadata?.publishable === false ? [index + 1] : []);
  const foreignProcesses = runs.flatMap((run) => run.__metadata?.foreignProcesses ?? []).flatMap((value) => {
    try { return JSON.parse(value); } catch { return [{ Name: "desconocido", ProcessId: "?", CommandLine: value }]; }
  });
  const publicationBanner = forcedRuns.length
    ? [
      `> **NO PUBLICABLE:** \`hygieneForced=true\`, \`publishable=false\` en las corridas ${forcedRuns.join(", ")}.`,
      "",
      "Procesos Edge/WebView2 ajenos detectados:",
      "",
      ...foreignProcesses.map((entry) => `- ${entry.Name ?? "desconocido"} PID ${entry.ProcessId ?? "?"}, padre ${entry.ParentProcessId ?? "?"}: \`${entry.CommandLine ?? "sin línea de comandos"}\``),
      "",
    ]
    : [];
  const systemRows = runs.flatMap((run, index) => {
    const metadata = run.__metadata;
    const paths = (metadata?.systemWebView2Paths ?? []).flatMap((value) => {
      try { return JSON.parse(value); } catch { return [value]; }
    });
    const renderedPaths = paths.length ? paths.map((value) => `\`${value}\``).join("<br>") : "—";
    return [`| ${index + 1} | ${metadata?.systemWebView2Count ?? 0} | ${renderedPaths} |`];
  });
  const droppedRows = runs.flatMap((run, index) => {
    const metric = run.game?.dropped;
    if (!metric) return [];
    return [`| ${index + 1} | ${metric.sum} | ${metric.samples} | ${(metric.mean * 100).toFixed(3)} % |`];
  });
  return [
    `# Huella mínima · ${condition}`,
    "",
    `Corridas: ${files.map((file) => `\`${path.basename(file)}\``).join(", ")}. Ruido = desviación muestral / media; hacen falta al menos ${MIN_PUBLISHABLE_RUNS} corridas y el gate falla por encima de 5 %.`,
    "",
    ...publicationBanner,
    "## WebView2 del sistema permitidos",
    "",
    "No invalidan la corrida porque cada perfil tiene browser y GPU process propios.",
    "",
    "| Corrida | Procesos | Perfiles `--user-data-dir` |",
    "|---:|---:|---|",
    ...systemRows,
    "",
    "## Resumen por corrida",
    "",
    "| Corrida | Rol | Métrica | Media | p50 | p95 | p99 | Máximo |",
    "|---:|---|---|---:|---:|---:|---:|---:|",
    ...runRows,
    "",
    ...(droppedRows.length ? [
      "## Frames perdidos",
      "",
      "| Corrida | Perdidos | Frames totales | Porcentaje |",
      "|---:|---:|---:|---:|",
      ...droppedRows,
      "",
    ] : []),
    "## Repetibilidad entre corridas",
    "",
    "| Condición | Rol | Métrica | N | Media | Desviación | Ruido | Gate |",
    "|---|---|---|---:|---:|---:|---:|:---:|",
    ...rows,
    "",
  ].join("\n");
}

async function main() {
  const argument = (name, fallback = "") => {
    const index = process.argv.indexOf(`--${name}`);
    return index >= 0 ? process.argv[index + 1] ?? fallback : fallback;
  };
  const condition = argument("condition");
  const output = argument("output");
  const files = process.argv.slice(2).filter((value, index, values) => value.endsWith(".csv") && values[index - 1] !== "--output");
  const runSummary = process.argv.includes("--run-summary");
  if (!condition || !output || !files.length) {
    throw new Error("usage: node huella-resumen.mjs --condition A1 --output resumen.md run-1.csv [run-2.csv ...]");
  }
  const runs = await Promise.all(files.map(async (file) => summarizeRun(parseCsv(await readFile(file, "utf8")))));
  let aggregate;
  if (runSummary && runs.some((run) => run.__metadata?.publishable === false)) {
    aggregate = [];
  } else {
    aggregate = aggregateRuns(runs);
  }
  await writeFile(output, renderMarkdown(condition, aggregate, files, runs), { encoding: "utf8", flag: "wx" });
  process.stdout.write(`${JSON.stringify({ condition, files, aggregate })}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main();
}
