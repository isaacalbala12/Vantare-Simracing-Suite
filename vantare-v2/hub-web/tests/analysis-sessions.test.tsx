// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { AnalysisReply } from "../src/contract/generated/analysis";
import type { MockContext } from "../src/mock/context";
import { create } from "../src/mock/modules/analysis";
import type { AnalysisSnapshot } from "../src/renderer/app/AnalysisController";
import { lapTime, summarizeLaps } from "../src/renderer/app/analysis-laps";
import { offline } from "../src/renderer/app/Host";
import { AnalysisCatalog } from "../src/renderer/ui/analysis/Analysis";
import { AnalysisLaps } from "../src/renderer/ui/analysis/RecordingDetail";
import { TooltipProvider } from "../src/renderer/ui/Layers";

afterEach(cleanup);
function recording(sceneName = "analysis") {
  const core = structuredClone(offline);
  Object.assign(core.access, {
    verified: true,
    blocked: false,
    analysis: true,
  });
  core.rights = "connected";
  const mock = create({ core, sceneName } as MockContext);
  function result<T extends AnalysisReply["method"]>(
    message: ReturnType<typeof mock>,
    method: T,
  ) {
    if (message?.kind !== "response" || message.result.method !== method)
      throw Error(method);
    return message.result as Extract<AnalysisReply, { method: T }>;
  }
  const { recordings } = result(
    mock({ kind: "request", id: 1, request: { method: "analysis.catalog" } }),
    "analysis.catalog",
  );
  const selected = recordings[0];
  const inspection = result(
    mock({
      kind: "request",
      id: 2,
      request: { method: "analysis.inspect", id: selected.id },
    }),
    "analysis.inspect",
  );
  const opened = result(
    mock({
      kind: "request",
      id: 3,
      request: { method: "analysis.open", id: selected.id },
    }),
    "analysis.open",
  );
  const state: AnalysisSnapshot = {
    rows: [selected],
    inspections: { [selected.id]: inspection },
    rowErrors: {},
    loading: false,
    opening: false,
    selected,
    opened,
  };
  return { state, selected, inspection, opened };
}
const clock = () => 1700005000000;
const timeZone = "UTC";
const handler = vi.fn();

it("shows the latest session's identity and official best with accessible context", () => {
  const { state, inspection } = recording();
  inspection.sessions[0].bestLapMs = 112225;
  inspection.sessions[1].trackName = "Monza";
  render(
    <AnalysisCatalog
      state={state}
      enabled
      settings={handler}
      clock={clock}
      timeZone={timeZone}
    />,
  );
  const row = screen.getByRole("button", {
    name: /Spa.*Porsche.*GT3.*\+1 sesiones/,
  });
  expect(row.getAttribute("aria-description")).toContain("1 sesión más");
  expect(within(row).getByText("+1 sesiones").getAttribute("title")).toContain(
    "1 sesión más",
  );
  const cell = screen.getByRole("cell", { name: "1:52.225" });
  expect(cell.getAttribute("aria-description")).toContain(
    "sesión más reciente",
  );
  expect(screen.queryByText("Monza")).toBeNull();
  expect(screen.queryByText("1:51.625")).toBeNull();
});

it("falls back to the approximate recording time when the latest session has no official best", () => {
  const { state, inspection } = recording();
  inspection.sessions[0].bestLapMs = null;
  render(
    <AnalysisCatalog
      state={state}
      enabled
      settings={handler}
      clock={clock}
      timeZone={timeZone}
    />,
  );
  expect(screen.getByRole("cell", { name: "≈1:51.6" })).toBeTruthy();
  expect(screen.queryByText("1:51.625")).toBeNull();
});

it("preserves the v1 catalog and flat detail with unidentified names and approximate times", () => {
  const { state } = recording("analysis-v1");
  const { unmount } = render(
    <AnalysisCatalog
      state={state}
      enabled
      settings={handler}
      clock={clock}
      timeZone={timeZone}
    />,
  );
  expect(screen.getByText("Circuito sin identificar").tagName).toBe("EM");
  expect(screen.getByText("Coche sin identificar").tagName).toBe("EM");
  expect(screen.getByRole("cell", { name: "≈1:51.6" })).toBeTruthy();
  unmount();
  render(
    <TooltipProvider>
      <AnalysisLaps
        state={state}
        enabled
        updates={handler}
        clock={clock}
        timeZone={timeZone}
      />
    </TooltipProvider>,
  );
  const table = screen.getByRole("table") as HTMLTableElement;
  expect(table.tBodies).toHaveLength(1);
  expect(table.tBodies[0].querySelector('[scope="rowgroup"]')).toBeNull();
  expect(
    screen.getByRole("heading", {
      name: "Circuito sin identificar · Coche sin identificar",
    }),
  ).toBeTruthy();
  expect(table.caption?.textContent).toContain(
    "Tiempos aproximados, no oficiales.",
  );
});

it("uses valid official times first, keeps missing values distinct and marks a mixed mean approximate", () => {
  const { opened } = recording();
  const official = { ...opened.laps[1], lapTimeApproxMs: null };
  const fallback = { ...opened.laps[0], lapTimeMs: null };
  expect(lapTime(official)).toEqual({ ms: 111625, official: true });
  expect(lapTime(fallback)).toEqual({ ms: 112400, official: false });
  expect(lapTime({ ...official, gap: true }).ms).toBeNull();
  expect(lapTime({ ...official, sealed: false }).ms).toBeNull();
  expect(summarizeLaps([official, fallback])).toMatchObject({
    bestTime: 111625,
    bestOfficial: true,
    mean: 112012.5,
    meanOfficial: false,
    approximate: true,
    withoutTime: 0,
  });
});

it("groups crossings by the reply indices and omits the approximate note for official-only data", () => {
  const { state, opened } = recording();
  const latest = opened.sessions[0];
  latest.kind = "other";
  latest.kindText = "Warm-up";
  opened.laps.push({ ...opened.laps[0], index: 9, lap: 9, session: null });
  render(
    <TooltipProvider>
      <AnalysisLaps
        state={state}
        enabled
        updates={handler}
        clock={clock}
        timeZone={timeZone}
      />
    </TooltipProvider>,
  );
  const table = screen.getByRole("table") as HTMLTableElement;
  expect(
    screen.getByRole("heading", { name: "Spa · Porsche 911 GT3 R · GT3" }),
  ).toBeTruthy();
  expect(screen.getAllByText(/Warm-up/).length).toBeGreaterThan(0);
  const groups = [...table.tBodies];
  expect(groups).toHaveLength(3);
  expect(within(groups[0]).getByText("Vuelta 4")).toBeTruthy();
  expect(within(groups[0]).getByText(/Interrumpida/)).toBeTruthy();
  expect(within(groups[1]).getByText("1:51.625")).toBeTruthy();
  expect(
    within(groups[1]).getByText(/Posición al cerrar la sesión: 3/),
  ).toBeTruthy();
  expect(within(groups[2]).getByText("Vuelta 9")).toBeTruthy();
  expect(groups[2].querySelector('[scope="rowgroup"]')).toBeNull();
  expect(table.caption?.textContent).not.toContain(
    "Tiempos aproximados, no oficiales.",
  );
});
