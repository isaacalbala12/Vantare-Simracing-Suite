// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import type { AnalysisLap } from "../src/contract/generated/analysis";
import type { Opened } from "../src/renderer/app/AnalysisController";
import { AnalysisRail } from "../src/renderer/ui/analysis/Analysis";

afterEach(cleanup);

const signal = {
  reliable: 1,
  estimated: 0,
  stale: 0,
  unavailable: 0,
  min: 1,
  mean: 1,
  max: 1,
};
const lap = (index: number, number: number): AnalysisLap => ({
  index,
  lap: number,
  car: 0,
  sealed: true,
  gap: false,
  samples: 10,
  lapTimeApproxMs: 90_000,
  session: null,
  lapTimeMs: null,
  sectorsMs: null,
  speed: signal,
  throttle: signal,
  brake: signal,
});
const row = { id: "1", startedAtMs: 1, sizeBytes: 800_000, recording: false };
const opened = (finished: boolean, laps: AnalysisLap[]): Opened => ({
  method: "analysis.open",
  watermark: String(laps.length),
  finished,
  attempted: "3",
  total: String(laps.length),
  laps,
  sessions: [],
});
const rail = (value: Opened) =>
  render(
    <AnalysisRail
      state={{
        rows: [row],
        inspections: {},
        rowErrors: {},
        loading: false,
        opening: false,
        selected: row,
        opened: value,
      }}
      clock={() => 2}
      timeZone="Europe/Madrid"
    />,
  );

it("says complete only when storage confirmed the end (#2871)", () => {
  rail(opened(true, [lap(1, 1), lap(2, 2)]));
  expect(screen.getByText("Completa")).toBeTruthy();
  expect(screen.queryByText(/Incompleta|Se guardó/)).toBeNull();
});
it("an incomplete recording says up to which lap it was saved, never an error", () => {
  rail(opened(false, [lap(2, 5), lap(1, 4)]));
  expect(screen.getByText("Incompleta")).toBeTruthy();
  const saved = screen.getByText("Se guardó").closest("div");
  expect(saved?.textContent).toBe("Se guardóhasta la vuelta 5");
  expect(screen.queryByText(/error/i)).toBeNull();
});
it("an incomplete recording with no lap saved says only incomplete", () => {
  rail(opened(false, []));
  expect(screen.getByText("Incompleta")).toBeTruthy();
  expect(screen.queryByText("Se guardó")).toBeNull();
});
