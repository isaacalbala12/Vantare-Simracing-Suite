import { expect, it } from "vitest";
import type { AnalysisLap } from "../src/contract/generated/analysis";
import { analysisQaNow } from "../src/mock/analysis-scenes";
import { createMockHost } from "../src/mock/host";
import {
  estimatedLap,
  lapDataKind,
  savedLaps,
  summarizeLaps,
  validLapTime,
} from "../src/renderer/app/analysis-laps";

function laps() {
  const host = createMockHost(
    "analysis-qa-laps",
    undefined,
    () => analysisQaNow,
  );
  host({ kind: "request", id: 1, request: { method: "analysis.catalog" } });
  const response = host({
    kind: "request",
    id: 2,
    request: { method: "analysis.open", id: "1".padStart(64, "0") },
  });
  if (
    response?.kind !== "response" ||
    response.result.method !== "analysis.open"
  )
    throw Error("missing recording fixture");
  return response.result.laps;
}
it("derives every summary metric from sealed laps and reduced signals", () => {
  const summary = summarizeLaps(laps());
  expect(summary.best?.lap).toBe(7);
  expect(summary.bestTime).toBe(111600);
  expect(summary.mean).toBeCloseTo(112494.7);
  expect(summary.complete).toBe(10);
  expect(summary.gaps).toBe(1);
  expect(summary.withoutTime).toBe(3);
  expect(summary.maxSpeed).toBeCloseTo(276);
  expect(summary.fastest?.lap).toBe(4);
});
it("does not invent a best lap, mean or zero speed for missing data", () => {
  const values = laps().map((lap) => ({
    ...lap,
    sealed: false,
    gap: false,
    speed: { ...lap.speed, min: null, mean: null, max: null },
  }));
  const summary = summarizeLaps(values);
  expect(summary.bestTime).toBeNull();
  expect(summary.mean).toBeNull();
  expect(summary.maxSpeed).toBeNull();
  expect(summary.best).toBeUndefined();
  expect(summary.fastest).toBeUndefined();
  expect(summarizeLaps([]).complete).toBe(0);
});
it("treats gaps, incomplete and unsealed laps distinctly", () => {
  const values = laps();
  expect(lapDataKind(values[0])).toBe("incomplete");
  expect(lapDataKind(values[4])).toBe("gap");
  expect(lapDataKind(values[13])).toBe("unsealed");
  expect(lapDataKind(values[6])).toBe("complete");
  expect(validLapTime({ ...values[6], gap: true })).toBeNull();
  expect(validLapTime({ ...values[6], sealed: false })).toBeNull();
});
it("keeps reduced signal quality visible without recalculating the host aggregates", () => {
  const values = laps();
  expect(estimatedLap(values[0])).toBe(false);
  expect(estimatedLap(values[11])).toBe(true);
  const stale: AnalysisLap = {
    ...values[0],
    brake: { ...values[0].brake, stale: 1 },
  };
  expect(estimatedLap(stale)).toBe(true);
});
it("an incomplete recording keeps up to its last sealed lap and names a half one after it", () => {
  const base = laps()[0];
  const lap = (index: number, number: number, sealed: boolean) => ({
    ...base,
    index,
    lap: number,
    sealed,
  });
  // Solo selladas: la última sellada, sin parcial.
  expect(savedLaps([lap(0, 7, true), lap(1, 8, true)])).toEqual({
    complete: 8,
    partial: undefined,
  });
  // Sellada + parcial: la parcial va aparte; el orden es el de la grabación.
  expect(
    savedLaps([lap(2, 9, false), lap(0, 7, true), lap(1, 8, true)]),
  ).toEqual({ complete: 8, partial: 9 });
  // Una sesión nueva vuelve a la vuelta 0: cuenta la posición, no el número.
  expect(savedLaps([lap(0, 12, true), lap(1, 0, true)])).toEqual({
    complete: 0,
    partial: undefined,
  });
  // Ninguna sellada: no hay nada que decir.
  expect(savedLaps([lap(0, 1, false)])).toBeUndefined();
  expect(savedLaps([])).toBeUndefined();
});
