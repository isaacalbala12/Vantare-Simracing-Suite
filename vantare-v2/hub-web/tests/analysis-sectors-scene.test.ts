import { describe, expect, it } from "vitest";
import type {
  AnalysisLap,
  AnalysisPoint,
} from "../src/contract/generated/analysis";
import { analysisQaNow } from "../src/mock/analysis-scenes";
import { createMockHost } from "../src/mock/host";
import type { Compared } from "../src/renderer/app/AnalysisController";
import { biggestChanges } from "../src/renderer/app/analysis-comparison";

/** Compara dos vueltas de una escena QA de sectores con el adaptador real del mock. */
function compare(variant: string, a: number, b: number) {
  let id = 0;
  const host = createMockHost(
    `analysis-qa-sectors-${variant}`,
    () => {},
    () => analysisQaNow,
  );
  const ask = (request: object) => {
    const reply = host({ kind: "request", id: ++id, request } as never);
    if (reply?.kind !== "response")
      throw Error(`sin respuesta ${JSON.stringify(reply)}`);
    return reply.result;
  };
  ask({ method: "analysis.catalog" });
  const opened = ask({ method: "analysis.open", id: "a".repeat(64) });
  if (opened.method !== "analysis.open") throw Error("open");
  const result = ask({
    method: "analysis.compare",
    session: opened.session,
    a,
    b,
  });
  if (result.method !== "analysis.compare") throw Error("compare");
  return { laps: opened.laps as AnalysisLap[], result };
}
const at = (points: AnalysisPoint[], distance: number) =>
  points.find((p) => p.distance === distance)?.value;

describe("escena QA «Comparar con sectores»", () => {
  const { laps, result } = compare("con", 5, 2);
  const [a, b] = [laps[5], laps[2]];
  const lapDiff = ((a.lapTimeMs ?? 0) - (b.lapTimeMs ?? 0)) / 1000;
  const sectorDiff = [0, 1, 2].map(
    (i) => ((a.sectorsMs?.[i] ?? 0) - (b.sectorsMs?.[i] ?? 0)) / 1000,
  );

  it("los sectores oficiales suman la diferencia de vuelta", () => {
    expect(sectorDiff.reduce((x, y) => x + y, 0)).toBeCloseTo(lapDiff, 9);
  });
  it("la curva Diferencia A−B termina en la diferencia de vuelta", () => {
    const end = result.delta?.at(-1)?.value ?? Number.NaN;
    expect(end).toBeCloseTo(lapDiff, 6);
    expect(Math.abs(end)).toBeLessThan(0.5);
  });
  it("la curva pasa por la diferencia acumulada al cerrar cada sector", () => {
    const delta = result.delta ?? [];
    const total = (b.sectorsMs ?? []).reduce((x, y) => x + y, 0);
    let cumulative = 0;
    let cumulativeDiff = 0;
    for (const i of [0, 1]) {
      cumulative += b.sectorsMs?.[i] ?? 0;
      cumulativeDiff += sectorDiff[i];
      const here = delta.reduce((best, p) =>
        Math.abs(p.distance - (cumulative / total) * 5000) <
        Math.abs(best.distance - (cumulative / total) * 5000)
          ? p
          : best,
      );
      expect(here.value).toBeCloseTo(cumulativeDiff, 1);
    }
  });
  it("«Dónde cambia más» marca el mismo signo que el primer sector (A pierde)", () => {
    const top = biggestChanges(result as Compared)[0];
    expect(Math.sign(top.delta)).toBe(Math.sign(sectorDiff[0]));
    expect(Math.abs(top.delta)).toBeLessThan(0.1);
    expect(at(result.delta ?? [], 0)).toBe(0);
  });
  it("los tiempos transcurridos de A y B acaban en su tiempo oficial", () => {
    const end = (side: "a" | "b") =>
      result.speed[side].at(-1)?.elapsed ?? Number.NaN;
    expect(end("a")).toBeCloseTo((a.lapTimeMs ?? 0) / 1000, 6);
    expect(end("b")).toBeCloseTo((b.lapTimeMs ?? 0) / 1000, 6);
  });
  it("sin sectores o con tiempo aproximado, la curva sigue acabando en A−B", () => {
    for (const [variant, x, y] of [
      ["mezcla", 8, 5],
      ["v1", 5, 1],
    ] as const) {
      const run = compare(variant, x, y);
      const time = (lap: AnalysisLap) =>
        (lap.lapTimeMs ?? lap.lapTimeApproxMs ?? 0) / 1000;
      expect(run.result.delta?.at(-1)?.value).toBeCloseTo(
        time(run.laps[x]) - time(run.laps[y]),
        6,
      );
    }
  });
});
