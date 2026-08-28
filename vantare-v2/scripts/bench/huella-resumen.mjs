import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const METRICS = ["privateBytes", "workingSetBytes", "cpuPct", "gpuPct", "gpuDedicatedBytes", "frameTimeMs"];

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

export function summarizeRun(rows) {
  const groups = Map.groupBy(rows, (row) => row.role);
  return Object.fromEntries([...groups].map(([role, roleRows]) => {
    const metrics = {};
    for (const metric of METRICS) {
      const values = roleRows.map((row) => Number(row[metric])).filter(Number.isFinite);
      if (!values.length) continue;
      metrics[metric] = {
        mean: mean(values),
        p50: percentile(values, 0.50),
        p95: percentile(values, 0.95),
        p99: percentile(values, 0.99),
        max: Math.max(...values),
      };
    }
    return [role, metrics];
  }));
}

export function aggregateRuns(runs) {
  const roles = new Set(runs.flatMap((run) => Object.keys(run)));
  return [...roles].flatMap((role) => METRICS.flatMap((metric) => {
    const values = runs.map((run) => run[role]?.[metric]?.mean).filter(Number.isFinite);
    if (!values.length) return [];
    const average = mean(values);
    const deviation = standardDeviation(values);
    const noisePct = average === 0 ? (deviation === 0 ? 0 : Infinity) : Math.abs(deviation / average) * 100;
    return [{ role, metric, runs: values.length, mean: average, deviation, noisePct, pass: noisePct <= 5 }];
  }));
}

function displayValue(metric, value) {
  if (!Number.isFinite(value)) return "—";
  if (/Bytes$/.test(metric)) return `${(value / 1024 / 1024).toFixed(2)} MB`;
  if (metric === "frameTimeMs") return `${value.toFixed(3)} ms`;
  return value.toFixed(3);
}

export function renderMarkdown(condition, aggregate, files) {
  const rows = aggregate.map((entry) =>
    `| ${condition} | ${entry.role} | ${entry.metric} | ${entry.runs} | ${displayValue(entry.metric, entry.mean)} | ${displayValue(entry.metric, entry.deviation)} | ${Number.isFinite(entry.noisePct) ? entry.noisePct.toFixed(2) : "∞"} % | ${entry.pass ? "✓" : "✗"} |`,
  );
  return [
    `# Huella mínima · ${condition}`,
    "",
    `Corridas: ${files.map((file) => `\`${path.basename(file)}\``).join(", ")}. Ruido = desviación muestral / media; el gate falla por encima de 5 %.`,
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
  if (!condition || !output || !files.length) {
    throw new Error("usage: node huella-resumen.mjs --condition A1 --output resumen.md run-1.csv [run-2.csv ...]");
  }
  const runs = await Promise.all(files.map(async (file) => summarizeRun(parseCsv(await readFile(file, "utf8")))));
  const aggregate = aggregateRuns(runs);
  await writeFile(output, renderMarkdown(condition, aggregate, files), { encoding: "utf8", flag: "wx" });
  process.stdout.write(`${JSON.stringify({ condition, files, aggregate })}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main();
}
