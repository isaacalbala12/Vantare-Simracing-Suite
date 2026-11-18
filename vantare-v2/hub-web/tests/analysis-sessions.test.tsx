// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { AnalysisReply } from "../src/contract/generated/analysis";
import type { MockContext } from "../src/mock/context";
import { create } from "../src/mock/modules/analysis";
import type { AnalysisSnapshot } from "../src/renderer/app/AnalysisController";
import { lapTime, summarizeLaps } from "../src/renderer/app/analysis-laps";
import { offline } from "../src/renderer/app/Host";
import { analysisText } from "../src/renderer/i18n/analysis.es";
import { AnalysisCatalog } from "../src/renderer/ui/analysis/Analysis";
import { Comparison } from "../src/renderer/ui/analysis/Comparison";
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

function renderCatalog(state: AnalysisSnapshot) {
  return render(
    <AnalysisCatalog
      state={state}
      enabled
      settings={handler}
      clock={clock}
      timeZone={timeZone}
    />,
  );
}

function renderLaps(state: AnalysisSnapshot) {
  return render(
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
}

function expectRecordingBest(state: AnalysisSnapshot, time: string) {
  const { unmount } = renderCatalog(state);
  const cell = screen.getByRole("cell", { name: time });
  expect(cell.getAttribute("aria-description")).toBe(
    "Mejor vuelta de la grabación",
  );
  unmount();
  renderLaps(state);
  const best = screen.getByText(analysisText.best, { selector: "dt" });
  expect(best.nextElementSibling?.querySelector("strong")?.textContent).toBe(
    time,
  );
}

it("shows the latest session identity but uses the older session's faster official time in both views", () => {
  const { state, inspection, opened } = recording();
  for (const sessions of [inspection.sessions, opened.sessions]) {
    sessions[0].bestLapMs = 110000;
    sessions[1].bestLapMs = 108000;
    sessions[1].trackName = "Monza";
  }
  const { unmount } = renderCatalog(state);
  const row = screen.getByRole("button", {
    name: /Spa.*Porsche.*GT3.*\+1 sesión$/,
  });
  expect(row.getAttribute("aria-description")).toContain("1 sesión más");
  expect(within(row).getByText("+1 sesión").getAttribute("title")).toContain(
    "1 sesión más",
  );
  expect(screen.queryByText("Monza")).toBeNull();
  unmount();
  expectRecordingBest(state, "1:48.000");
});

it.each([
  [1, "+1 sesión"],
  [2, "+2 sesiones"],
])("inflects the additional session count %s", (count, label) =>
  expect(analysisText.moreSessions(count)).toBe(label),
);

it("keeps the older official best when the newest session is unsealed", () => {
  const { state, inspection, opened } = recording();
  for (const sessions of [inspection.sessions, opened.sessions]) {
    sessions[0].sealed = false;
    sessions[0].bestLapMs = null;
  }
  expectRecordingBest(state, "1:51.625");
});

it("marks the recording best approximate when neither session supplies an official best", () => {
  const { state, inspection, opened } = recording();
  for (const session of [...inspection.sessions, ...opened.sessions])
    session.bestLapMs = null;
  expectRecordingBest(state, "≈1:51.6");
});

it("preserves the v1 catalog and flat detail with unidentified names and approximate times", () => {
  const { state } = recording("analysis-v1");
  const { unmount } = renderCatalog(state);
  expect(screen.getByText("Circuito sin identificar").tagName).toBe("EM");
  expect(screen.getByText("Coche sin identificar").tagName).toBe("EM");
  unmount();
  expectRecordingBest(state, "≈1:51.6");
  expect(
    screen.getByText(analysisText.approximate, { selector: "p" }),
  ).toBeTruthy();
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
  expect(groups[0].querySelector('th[scope="rowgroup"]')?.textContent).toBe(
    "Warm-up · Interrumpida",
  );
  expect(groups[1].querySelector('th[scope="rowgroup"]')?.textContent).toBe(
    "Clasificación · Posición al cerrar la sesión: 3",
  );
  expect(within(groups[0]).getByText("Vuelta 4")).toBeTruthy();
  expect(within(groups[1]).getByText("1:51.625")).toBeTruthy();
  expect(within(groups[2]).getByText("Vuelta 9")).toBeTruthy();
  expect(groups[2].querySelector('[scope="rowgroup"]')).toBeNull();
  expect(table.caption?.textContent).not.toContain(analysisText.approximate);
  expect(
    screen.queryByText(analysisText.approximate, { selector: "p" }),
  ).toBeNull();
});

it("keeps session identities in the groups when the circuit differs", () => {
  const { state, opened } = recording();
  opened.sessions[1].trackName = "Monza";
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
  const headers = screen
    .getByRole("table")
    .querySelectorAll('th[scope="rowgroup"][colspan="9"]');
  expect(headers[0]?.textContent).toContain("Spa · Porsche 911 GT3 R · GT3");
  expect(headers[1]?.textContent).toContain("Monza · Porsche 911 GT3 R · GT3");
});

it("numbers unnamed sessions from oldest to newest by their position in the reply", () => {
  const { state, opened } = recording();
  for (const session of opened.sessions) {
    session.kind = "unknown";
    session.kindText = null;
  }
  renderLaps(state);
  const table = screen.getByRole("table") as HTMLTableElement;
  const groupTitle = (group: HTMLTableSectionElement) =>
    group.querySelector('th[scope="rowgroup"]')?.textContent;
  expect(groupTitle(table.tBodies[0])).toContain("Sesión 2");
  expect(within(table.tBodies[0]).getByText("Vuelta 4")).toBeTruthy();
  expect(groupTitle(table.tBodies[1])).toContain("Sesión 1");
  expect(within(table.tBodies[1]).getByText("Vuelta 1")).toBeTruthy();
});

it.each([-1, 2])(
  "shows laps with session %s in the untitled group",
  (session) => {
    const { state, opened } = recording();
    opened.laps.push({ ...opened.laps[0], index: 9, lap: 9, session });
    renderLaps(state);
    const table = screen.getByRole("table") as HTMLTableElement;
    const group = table.tBodies[table.tBodies.length - 1];
    expect(within(group).getByText("Vuelta 9")).toBeTruthy();
    expect(group.querySelector('th[scope="rowgroup"]')).toBeNull();
  },
);

it("keeps the legacy caption when the recording has no timed laps", () => {
  const { state, opened } = recording("analysis-v1");
  for (const lap of opened.laps) lap.lapTimeApproxMs = null;
  renderLaps(state);
  const table = screen.getByRole("table") as HTMLTableElement;
  expect(table.caption?.textContent).toContain(analysisText.approximate);
});

it("uses the latest date for identity and preserves original session indices for laps", () => {
  const { state, inspection, opened } = recording();
  for (const sessions of [inspection.sessions, opened.sessions]) {
    sessions[1].trackName = "Monza";
    sessions.reverse();
  }
  for (const lap of opened.laps) {
    if (lap.session !== null) lap.session = 1 - lap.session;
  }
  const { unmount } = renderCatalog(state);
  expect(
    screen.getByRole("button", { name: /Spa.*Porsche.*GT3/ }),
  ).toBeTruthy();
  unmount();
  renderLaps(state);
  expect(screen.getByRole("heading", { name: /Spa · Porsche/ })).toBeTruthy();
  const table = screen.getByRole("table") as HTMLTableElement;
  const [recent, older] = table.tBodies;
  expect(recent.textContent).toContain("Carrera");
  expect(within(recent).getByText("Vuelta 4")).toBeTruthy();
  expect(older.textContent).toContain("Clasificación");
  expect(within(older).getByText("Vuelta 1")).toBeTruthy();
});

it("keeps the original order for sessions starting at the same instant", () => {
  const { state, opened } = recording();
  opened.sessions[1].startedAtMs = opened.sessions[0].startedAtMs;
  renderLaps(state);
  const table = screen.getByRole("table") as HTMLTableElement;
  expect(within(table.tBodies[0]).getByText("Vuelta 4")).toBeTruthy();
  expect(within(table.tBodies[1]).getByText("Vuelta 1")).toBeTruthy();
});

it.each([
  [false, /Spa.*Warm-up \(A\) \/ Clasificación \(B\)/],
  [true, /Spa.*Warm-up \(A\) \/ Monza.*Clasificación \(B\)/],
] as const)(
  "names both sessions in a comparison across sessions (different circuit: %s)",
  (different, header) => {
    const { state, opened } = recording();
    opened.sessions[0].kind = "other";
    opened.sessions[0].kindText = "Warm-up";
    if (different) opened.sessions[1].trackName = "Monza";
    state.pair = { a: 3, b: 1 };
    render(
      <TooltipProvider>
        <Comparison
          state={state}
          enabled
          updates={handler}
          clock={clock}
          timeZone={timeZone}
        />
      </TooltipProvider>,
    );
    expect(screen.getByText(header)).toBeTruthy();
  },
);
