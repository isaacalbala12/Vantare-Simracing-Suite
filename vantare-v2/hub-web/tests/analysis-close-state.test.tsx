// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import type { AnalysisLap } from "../src/contract/generated/analysis";
import type { Opened } from "../src/renderer/app/AnalysisController";
import { unbroken } from "../src/renderer/i18n/analysis.es";
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
const lap = (index: number, number: number, sealed = true): AnalysisLap => ({
  index,
  lap: number,
  car: 0,
  sealed,
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
  lostBlocks: "0",
  lostTailBlocks: "0",
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
const saved = () =>
  screen.queryByText("Se guardó")?.closest("div")?.textContent;

it("an incomplete recording says up to which lap it was saved, never an error", () => {
  rail(opened(false, [lap(1, 4), lap(2, 5)]));
  expect(screen.getByText("Incompleta")).toBeTruthy();
  expect(saved()).toBe(`Se guardó${unbroken("hasta la vuelta 5 completa")}`);
  expect(screen.queryByText(/error/i)).toBeNull();
});
it("a half lap after the last sealed one is named apart", () => {
  expect(unbroken("la 9 a medias")).toBe("la\u00a09\u00a0a\u00a0medias");
  rail(opened(false, [lap(1, 8), lap(2, 9, false)]));
  // Solo puede partirse antes de «·»: ni «la 9 a medias» ni el primer tramo se cortan.
  expect(saved()).toBe(
    `Se guardó${unbroken("hasta la vuelta 8 completa")} ${unbroken("· la 9 a medias")}`,
  );
});
it("lap 0 is a lap like any other", () => {
  rail(opened(false, [lap(1, 0), lap(2, 1, false)]));
  expect(saved()).toBe(
    `Se guardó${unbroken("hasta la vuelta 0 completa")} ${unbroken("· la 1 a medias")}`,
  );
});
it("without a sealed lap the saved row does not appear", () => {
  rail(opened(false, [lap(1, 3, false)]));
  expect(screen.getByText("Incompleta")).toBeTruthy();
  expect(saved()).toBeUndefined();
  cleanup();
  rail(opened(false, []));
  expect(saved()).toBeUndefined();
});

it("a finished recording that lost blocks under load is not complete and says what (#2883)", () => {
  for (const [lostBlocks, lostTailBlocks, text] of [
    ["3", "0", "una parte, el PC iba muy cargado"],
    ["0", "2", "el final, el PC iba muy cargado"],
    ["3", "2", "una parte y el final, el PC iba muy cargado"],
  ] as const) {
    rail({ ...opened(true, [lap(1, 4)]), lostBlocks, lostTailBlocks });
    expect(screen.getByText("Incompleta")).toBeTruthy();
    expect(screen.queryByText("Completa")).toBeNull();
    expect(screen.getByText("Se perdió").closest("div")?.textContent).toBe(
      `Se perdió${text}`,
    );
    cleanup();
  }
  rail(opened(true, [lap(1, 4)]));
  expect(screen.getByText("Completa")).toBeTruthy();
  expect(screen.queryByText("Se perdió")).toBeNull();
});
