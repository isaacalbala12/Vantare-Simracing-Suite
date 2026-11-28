// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import {
  type AnalysisLap,
  type AnalysisRecordingStatus,
  analysisRecordingCauses,
} from "../src/contract/generated/analysis";
import type { Opened } from "../src/renderer/app/AnalysisController";
import { unbroken } from "../src/renderer/i18n/analysis.es";
import {
  AnalysisCatalog,
  AnalysisRail,
} from "../src/renderer/ui/analysis/Analysis";

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
const rail = (
  value: Opened,
  recordingStatus?: AnalysisRecordingStatus | null,
) =>
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
        recordingStatus,
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
  const load = unbroken("el PC iba muy cargado");
  for (const [lostBlocks, lostTailBlocks, text] of [
    ["3", "0", `${unbroken("una parte,")} ${load}`],
    ["0", "2", `${unbroken("el final,")} ${load}`],
    ["3", "2", `${unbroken("una parte y el final,")} ${load}`],
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

const indicator = (
  cause: AnalysisRecordingStatus["cause"],
  rowId: string | null = row.id,
  state: AnalysisRecordingStatus["state"] = "stopped",
): AnalysisRecordingStatus => ({
  state,
  cause,
  rowId,
  startedAtMs: 1,
  durableWatermark: null,
  attempted: null,
  limits: { maxRecordings: 200, maxBytes: 5_000_000_000 },
  lastPrune: { atMs: 1, items: [] },
});
const labels = () =>
  [...document.querySelectorAll("dt")].map((dt) => dt.textContent);
const common = ["Fecha", "Circuito", "Coche", "Vueltas", "Tamaño", "Estado"];
const anyReason = /Motivo|falló\sal\sguardar|el\sguardado\sno\sterminó/;

it("an incomplete recording of the indicator says why, under its state (#2884)", () => {
  // Textos aprobados y enteros: sin coma, todos sus espacios son U+00A0.
  const writer = "falló\u00a0al\u00a0guardar";
  const timeout = "el\u00a0guardado\u00a0no\u00a0terminó\u00a0a\u00a0tiempo";
  for (const [cause, state, text] of [
    ["writerDown", "stopped", writer],
    ["writerDown", "degraded", writer],
    ["finishTimeout", "stopped", timeout],
    ["finishTimeout", "degraded", timeout],
  ] as const) {
    rail(
      opened(false, [lap(1, 8), lap(2, 9, false)]),
      indicator(cause, row.id, state),
    );
    expect(labels()).toEqual([...common, "Motivo", "Se guardó"]);
    const label = screen.getByText("Motivo");
    expect(label.tagName).toBe("DT");
    expect(label.nextElementSibling?.tagName).toBe("DD");
    expect(label.nextElementSibling?.textContent).toBe(text);
    cleanup();
  }
});
it("the reason also shows when a loss under load is what makes it incomplete", () => {
  rail(
    { ...opened(true, [lap(1, 4)]), lostBlocks: "3" },
    indicator("writerDown"),
  );
  expect(screen.getByText("Incompleta")).toBeTruthy();
  expect(labels()).toEqual([...common, "Motivo", "Se perdió"]);
});
it("a complete recording never shows a reason, whatever the indicator says", () => {
  for (const cause of ["writerDown", "finishTimeout"] as const) {
    rail(opened(true, [lap(1, 4)]), indicator(cause));
    expect(screen.getByText("Completa")).toBeTruthy();
    expect(labels()).toEqual(common);
    expect(document.body.textContent).not.toMatch(anyReason);
    cleanup();
  }
});
it("nothing is said about a recording that is not the indicator's", () => {
  for (const status of [
    indicator("writerDown", "2"),
    indicator("finishTimeout", "2"),
    indicator("writerDown", null),
    indicator("finishTimeout", null),
    null,
    undefined,
  ]) {
    rail(opened(false, [lap(1, 4)]), status);
    expect(labels()).toEqual([...common, "Se guardó"]);
    expect(document.body.textContent).not.toMatch(anyReason);
    cleanup();
  }
});
it("the reason leaves when the indicator moves on to another recording", () => {
  const view = (recordingStatus: AnalysisRecordingStatus) => (
    <AnalysisRail
      state={{
        rows: [row],
        inspections: {},
        rowErrors: {},
        loading: false,
        opening: false,
        selected: row,
        opened: opened(false, [lap(1, 4)]),
        recordingStatus,
      }}
      clock={() => 2}
      timeZone="Europe/Madrid"
    />
  );
  const { rerender } = render(view(indicator("writerDown")));
  expect(screen.getByText("Motivo")).toBeTruthy();
  rerender(view(indicator(null, "2", "recording")));
  expect(document.body.textContent).not.toMatch(anyReason);
});
it("no other cause, nor the lack of one, gives a reason", () => {
  const others = analysisRecordingCauses.filter(
    (cause) => cause !== "writerDown" && cause !== "finishTimeout",
  );
  expect(others.length).toBeGreaterThan(0);
  for (const cause of [...others, null])
    for (const state of ["recording", "degraded", "stopped"] as const) {
      rail(opened(false, [lap(1, 4)]), indicator(cause, row.id, state));
      expect(labels()).toEqual([...common, "Se guardó"]);
      expect(document.body.textContent).not.toMatch(anyReason);
      cleanup();
    }
});
it("the list never shows the reason: it would change with the next recording", () => {
  for (const cause of ["writerDown", "finishTimeout"] as const) {
    render(
      <AnalysisCatalog
        state={{
          rows: [row],
          inspections: {
            [row.id]: {
              method: "analysis.inspect",
              state: "unconfirmed",
              laps: 1,
              sessions: [],
              bestLapApproxMs: null,
            },
          },
          rowErrors: {},
          loading: false,
          opening: false,
          recordingStatus: indicator(cause),
        }}
        enabled
        settings={() => undefined}
        clock={() => 2}
        timeZone="Europe/Madrid"
      />,
    );
    expect(screen.getByText("Incompleta")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(anyReason);
    cleanup();
  }
});
