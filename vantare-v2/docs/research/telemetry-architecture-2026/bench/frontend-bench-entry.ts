// Research-only frontend benchmark entry. Bundled with the frontend's own
// esbuild (no new dependencies) and executed with node. It measures, per
// frame: JSON.parse, decodeOverlayProjectionV1 (schema validation +
// deepFreeze) and adaptOverlayProjectionToSnapshot (the legacy
// TelemetrySnapshot conversion the widgets actually consume).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { decodeOverlayProjectionV1 } from "../../../../frontend/src/overlay/projection/overlay-projection-v1";
import { adaptOverlayProjectionToSnapshot } from "../../../../frontend/src/overlay/projection/overlay-projection-adapter";

const payloadDir = resolve(process.argv[2] ?? "results/payloads");

type Case = Readonly<{ label: string; file: string; decode: boolean }>;

const cases: readonly Case[] = [
  { label: "overlay v1 x1", file: "overlay-v1-001.json", decode: true },
  { label: "overlay v1 x20", file: "overlay-v1-020.json", decode: true },
  { label: "overlay v1 x104", file: "overlay-v1-104.json", decode: true },
  { label: "compacto array x1", file: "compact-array-001.json", decode: false },
  { label: "compacto array x20", file: "compact-array-020.json", decode: false },
  { label: "compacto array x104", file: "compact-array-104.json", decode: false },
  { label: "compacto mapa x104", file: "compact-map-104.json", decode: false },
  { label: "canonical x104", file: "canonical-104.json", decode: false },
];

const ITERATIONS = 2000;
const WARMUP = 200;

function percentile(sorted: number[], fraction: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))];
}

function measure(label: string, iterations: number, run: () => void): string {
  for (let i = 0; i < WARMUP; i += 1) run();
  const samples: number[] = [];
  for (let i = 0; i < iterations; i += 1) {
    const start = process.hrtime.bigint();
    run();
    samples.push(Number(process.hrtime.bigint() - start) / 1000);
  }
  const total = samples.reduce((sum, value) => sum + value, 0);
  samples.sort((a, b) => a - b);
  return [
    label.padEnd(46),
    `${(total / samples.length).toFixed(1)} us media`.padStart(18),
    `${percentile(samples, 0.5).toFixed(1)} p50`.padStart(14),
    `${percentile(samples, 0.95).toFixed(1)} p95`.padStart(14),
    `${percentile(samples, 0.99).toFixed(1)} p99`.padStart(14),
  ].join(" ");
}

const lines: string[] = [];
lines.push(`node ${process.version}`);
lines.push(`${ITERATIONS} iteraciones por caso, ${WARMUP} de calentamiento`);
lines.push("");

for (const current of cases) {
  const raw = readFileSync(resolve(payloadDir, current.file), "utf8");
  lines.push(
    measure(`JSON.parse ${current.label} (${raw.length} B)`, ITERATIONS, () => {
      JSON.parse(raw);
    }),
  );

  if (!current.decode) continue;

  const parsed = JSON.parse(raw);
  const envelope = {
    product: "overlay",
    projectionVersion: 1,
    epoch: 1,
    sequence: 32,
    kind: "full",
    capturedAt: "2026-08-19T12:00:00.000Z",
    statusRevision: 1,
    payload: parsed,
  };

  lines.push(
    measure(`decodeOverlayProjectionV1 ${current.label}`, ITERATIONS, () => {
      decodeOverlayProjectionV1(envelope as never);
    }),
  );

  const decoded = decodeOverlayProjectionV1(envelope as never);
  lines.push(
    measure(`adapt->TelemetrySnapshot ${current.label}`, ITERATIONS, () => {
      adaptOverlayProjectionToSnapshot(decoded, { transportState: "live" } as never);
    }),
  );

  lines.push(
    measure(`parse+decode+adapt ${current.label}`, ITERATIONS, () => {
      const value = decodeOverlayProjectionV1({
        ...envelope,
        payload: JSON.parse(raw),
      } as never);
      adaptOverlayProjectionToSnapshot(value, { transportState: "live" } as never);
    }),
  );
  lines.push("");
}

process.stdout.write(lines.join("\n") + "\n");
