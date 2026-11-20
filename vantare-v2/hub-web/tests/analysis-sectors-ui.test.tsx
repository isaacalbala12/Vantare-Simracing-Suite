// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import type { AnalysisSnapshot } from "../src/renderer/app/AnalysisController";
import { analysisText as t } from "../src/renderer/i18n/analysis.es";
import { comparisonText } from "../src/renderer/i18n/comparison.es";
import { Comparison } from "../src/renderer/ui/analysis/Comparison";
import { ComparisonRail } from "../src/renderer/ui/analysis/ComparisonRail";
import { AnalysisLaps } from "../src/renderer/ui/analysis/RecordingDetail";
import { TooltipProvider } from "../src/renderer/ui/Layers";
import { lap, session, stateOf, timed } from "./analysis-sector-fixtures";

afterEach(cleanup);
const props = {
  updates: () => {},
  clock: () => 1_700_005_000_000,
  timeZone: "UTC",
};
const renderLaps = (state: AnalysisSnapshot) =>
  render(
    <TooltipProvider>
      <AnalysisLaps state={state} {...props} />
    </TooltipProvider>,
  );
const headings = () =>
  screen.getAllByRole("columnheader").map((cell) => cell.textContent);
const groupSpans = (root: HTMLElement) =>
  [...root.querySelectorAll<HTMLTableCellElement>('th[scope="rowgroup"]')].map(
    (cell) => cell.colSpan,
  );
const empty = { ...timed(0, null), lapTimeApproxMs: null };
const withSectors = [
  empty,
  timed(1, [41_204, 62_188, 34_492]),
  timed(2, [41_096, 62_493, 34_562]),
  timed(3, [41_402, 62_540, 34_435]),
  timed(4, [41_388, 62_091, 34_541]),
];

it("adds S1, S2 and S3 after the time and boxes the best of each one with a hidden label", () => {
  const { container } = renderLaps(stateOf(withSectors, [session("Spa")]));
  expect(headings().slice(0, 6)).toEqual([
    "Vuelta",
    "Tiempo",
    "S1",
    "S2",
    "S3",
    "Δ mejor",
  ]);
  expect(headings()).toHaveLength(12);
  expect(screen.getByText("41.096")).toBeTruthy();
  expect(screen.getByText("1:02.091")).toBeTruthy();
  const boxed = [...container.querySelectorAll(".v-an-laps .v-an-sector-best")];
  expect(boxed.map((cell) => cell.textContent)).toEqual([
    "41.096",
    "34.435",
    "1:02.091",
  ]);
  for (const sector of ["S1", "S2", "S3"])
    expect(screen.getByText(`, mejor ${sector}`).className).toBe("v-sr-only");
  expect(screen.getByText(t.sectorLegend(false))).toBeTruthy();
  expect(screen.queryByText(t.recordingWithoutSectors)).toBeNull();
  expect(container.textContent).not.toMatch(/oficial/i);
  const sectorCells = [
    ...container.querySelectorAll("tbody tr td:nth-child(n+3):nth-child(-n+5)"),
  ];
  expect(sectorCells.map((cell) => cell.textContent).join("")).not.toContain(
    "≈",
  );
});

it("shows a dash with 'sin dato' only where a lap has no sectors, and explains the one without a visible reason", () => {
  const laps = [
    ...withSectors,
    lap(5, { gap: true, session: 0 }),
    lap(6, { lapTimeMs: null, lapTimeApproxMs: 138_100 }),
    lap(7, { sectorsMs: null, lapTimeMs: 138_402 }),
  ];
  const { container } = renderLaps(stateOf(laps, [session("Spa")]));
  expect(screen.getAllByText("sin dato")).toHaveLength(4 * 3);
  expect(screen.getAllByText(t.noSectorsGiven)).toHaveLength(1);
  expect(screen.getByText(t.approximateNoSectors)).toBeTruthy();
  expect(
    container.querySelectorAll(".v-an-laps .v-an-sector-best"),
  ).toHaveLength(3);
});

it("keeps one table with 12 and 8 cell session rows when sectors appear", () => {
  const sessions = [session("Spa"), session("Spa")];
  const laps = [
    timed(0, null, 0),
    ...withSectors.slice(1).map((l) => ({ ...l, session: 1 })),
  ];
  const { container } = renderLaps(stateOf(laps, sessions));
  expect(groupSpans(container)).toEqual([12, 8, 12, 8]);
  expect(container.querySelector(".v-an-laps--sectors")).toBeTruthy();
});

it("hides the sector columns and says so when no lap has sectors (v1)", () => {
  const v1 = [timed(0, null), timed(1, null)].map((l) => ({
    ...l,
    lapTimeMs: null,
  }));
  const { container } = renderLaps(stateOf(v1));
  expect(headings()).not.toContain("S1");
  expect(headings()).toHaveLength(9);
  expect(screen.getByText(t.recordingWithoutSectors)).toBeTruthy();
  expect(screen.queryByText(t.sectorLegend(false))).toBeNull();
  expect(screen.queryByText(t.noSectorsGiven)).toBeNull();
  expect(container.querySelector(".v-an-laps--sectors")).toBeNull();
});

it("keeps the old 9 and 6 cell session rows when no lap has sectors", () => {
  const laps = [timed(0, null, 0), timed(1, null, 1)];
  const { container } = renderLaps(
    stateOf(laps, [session("Spa"), session("Spa")]),
  );
  expect(groupSpans(container)).toEqual([9, 6, 9, 6]);
});

const compare = (state: AnalysisSnapshot) =>
  render(
    <TooltipProvider>
      <Comparison state={state} {...props} />
    </TooltipProvider>,
  );
it("lists A, B and the signed difference per sector, with words as well as colour", () => {
  const laps = [
    timed(0, [41_204, 62_188, 34_492]),
    timed(1, [41_388, 62_091, 34_541]),
    timed(2, [41_000, 62_000, 34_541]),
  ];
  compare(stateOf(laps, [session("Spa")], { a: 1, b: 0 }));
  const table = screen.getByRole("table", { name: /sector/i });
  const rows = within(table).getAllByRole("row").slice(1);
  expect(rows.map((row) => row.textContent)).toEqual([
    "S141.38841.204+0.184 sA pierde",
    "S21:02.0911:02.188−0.097 sA gana",
    "S334.54134.492+0.049 sA pierde",
  ]);
  expect(within(rows[0]).getByText("+0.184 s").className).toContain(
    "v-an-compare-loss",
  );
  expect(within(rows[1]).getByText("−0.097 s").className).toContain(
    "v-an-compare-gain",
  );
});
it("says 'igual' when a sector ties", () => {
  const laps = [
    timed(0, [41_000, 62_000, 35_000]),
    timed(1, [41_000, 62_000, 35_000]),
  ];
  compare(stateOf(laps, [session("Spa")], { a: 1, b: 0 }));
  expect(screen.getAllByText("igual")).toHaveLength(3);
});
it("keeps the block when A has no sectors: dashes and one sentence with the reason", () => {
  const laps = [
    timed(0, [41_204, 62_188, 34_492]),
    lap(1, { lapTimeMs: null, lapTimeApproxMs: 138_100 }),
  ];
  compare(stateOf(laps, [session("Spa")], { a: 1, b: 0 }));
  const table = screen.getByRole("table", { name: /sector/i });
  const first = within(table).getAllByRole("row")[1];
  expect(first.textContent).toBe("S1—41.204—");
  expect(
    screen.getByText(comparisonText.sectorsWhy("A", 2, "approximate")),
  ).toBeTruthy();
});
it("names both laps when neither has sectors but the recording does", () => {
  const laps = [
    timed(0, [41_204, 62_188, 34_492]),
    lap(1, { lapTimeMs: null }),
    lap(2, { gap: true }),
  ];
  compare(stateOf(laps, [session("Spa")], { a: 1, b: 2 }));
  expect(
    screen.getByText(
      [
        comparisonText.noneHaveSectors,
        comparisonText.sectorsWhy("A", 2, "approximate"),
        comparisonText.sectorsWhy("B", 3, "gap"),
      ].join(" "),
    ),
  ).toBeTruthy();
});
it("says so in one line, without a table, when the recording has no sectors", () => {
  const laps = [timed(0, null), timed(1, null)];
  compare(stateOf(laps, [session("Spa")], { a: 1, b: 0 }));
  expect(screen.queryByRole("table", { name: /sector/i })).toBeNull();
  expect(screen.getByText(comparisonText.recordingWithoutSectors)).toBeTruthy();
});
it("uses the official times for the summary difference when A and B both have them", () => {
  const laps = [
    timed(0, [41_204, 62_188, 34_492]),
    timed(1, [41_388, 62_091, 34_541]),
  ];
  render(
    <ComparisonRail state={stateOf(laps, [session("Spa")], { a: 1, b: 0 })} />,
  );
  expect(screen.getByText("+0.136 s")).toBeTruthy();
  expect(screen.getByText(comparisonText.slower)).toBeTruthy();
  expect(screen.getByText(comparisonText.sectorsHelp)).toBeTruthy();
});
it.each([
  ["A", { a: 1, b: 0 }],
  ["B", { a: 0, b: 1 }],
] as const)(
  "keeps the approximate summary difference when only %s has an approximate time",
  (_, pair) => {
    const laps = [
      timed(0, [41_204, 62_188, 34_492]),
      lap(1, { lapTimeMs: null }),
    ];
    render(<ComparisonRail state={stateOf(laps, [session("Spa")], pair)} />);
    // Sin traza y sin dos tiempos oficiales no hay diferencia que enseñar.
    expect(
      screen.getByText(comparisonText.difference).nextElementSibling
        ?.textContent,
    ).toBe("—");
    expect(screen.getAllByText(comparisonText.noDelta)).toHaveLength(2);
  },
);
