import { expect, it } from "vitest";
import {
  hasSectors,
  lapSectors,
  sectorBests,
} from "../src/renderer/app/analysis-sectors";
import { sectorTime } from "../src/renderer/i18n/analysis.es";
import { lap, session, timed } from "./analysis-sector-fixtures";

it.each([
  [41_096, "41.096"],
  [5, "0.005"],
  [59_999, "59.999"],
  [60_000, "1:00.000"],
  [62_091, "1:02.091"],
])("formats the sector %i ms as %s", (ms, text) =>
  expect(sectorTime(ms)).toBe(text),
);
it("returns the three sectors the host sent when the lap shows an official time", () => {
  expect(lapSectors(lap(0))).toEqual([30_000, 40_000, 30_000]);
});
it.each([
  ["none", []],
  ["two", [50_000, 50_000]],
  ["four", [25_000, 25_000, 25_000, 25_000]],
  ["sixteen", Array(16).fill(6_250)],
  ["a zero", [0, 40_000, 60_000]],
  ["a negative", [30_000, -40_000, 110_000]],
  ["a NaN", [Number.NaN, 40_000, 30_000]],
  ["an Infinity", [30_000, Number.POSITIVE_INFINITY, 30_000]],
])(
  "never paints garbage if the host breaks its promise: %s means no sectors",
  (_, sectorsMs) => {
    expect(lapSectors(lap(0, { sectorsMs }))).toBeNull();
    expect(hasSectors([lap(0, { sectorsMs })])).toBe(false);
  },
);
it("does not check the sum: that rule belongs to the host", () => {
  // 3 s en total en una vuelta de 100 s: el renderer no lo valida.
  expect(lapSectors(lap(0, { sectorsMs: [1_000, 1_000, 1_000] }))).toEqual([
    1_000, 1_000, 1_000,
  ]);
});
it.each([
  ["missing field", { sectorsMs: null }],
  ["approximate time only", { lapTimeMs: null }],
  ["gap", { gap: true }],
  ["unsealed", { sealed: false }],
])("shows no sectors on a lap with %s", (_, over) =>
  expect(lapSectors(lap(0, over))).toBeNull(),
);
it("treats an absent lap as having no sectors", () =>
  expect(lapSectors(undefined)).toBeNull());

it("marks the best of each sector over the whole recording, ties included", () => {
  const laps = [
    timed(0, [41_204, 62_188, 34_492], 0),
    timed(1, [41_096, 62_493, 34_562], 1),
    timed(2, [41_402, 62_091, 34_492], 1),
    timed(3, null, 1),
  ];
  const { isBest, perSession } = sectorBests(laps, [
    session("Spa"),
    session("Spa"),
  ]);
  expect(perSession).toBe(false);
  expect([0, 1, 2].map((i) => isBest(laps[0], i as 0))).toEqual([
    false,
    false,
    true,
  ]);
  expect([0, 1, 2].map((i) => isBest(laps[1], i as 0))).toEqual([
    true,
    false,
    false,
  ]);
  expect([0, 1, 2].map((i) => isBest(laps[2], i as 0))).toEqual([
    false,
    true,
    true,
  ]);
  expect(isBest(laps[3], 0)).toBe(false);
});
it("takes the best sector per session when the sessions are at different circuits", () => {
  const laps = [
    timed(0, [41_000, 62_000, 34_000], 0),
    timed(1, [50_000, 70_000, 40_000], 1),
    timed(2, [49_000, 71_000, 40_000], 1),
    timed(3, null, 2),
  ];
  const { isBest, perSession } = sectorBests(laps, [
    session("Spa"),
    session("Monza"),
    session("Imola"),
  ]);
  expect(isBest(laps[3], 0)).toBe(false);
  expect(perSession).toBe(true);
  expect([0, 1, 2].map((i) => isBest(laps[0], i as 0))).toEqual([
    true,
    true,
    true,
  ]);
  expect([0, 1, 2].map((i) => isBest(laps[1], i as 0))).toEqual([
    false,
    true,
    true,
  ]);
  expect(isBest(laps[2], 0)).toBe(true);
});
it("does not split the best sector because one session has no circuit name", () => {
  const laps = [
    timed(0, [41_000, 62_000, 34_000], 0),
    timed(1, [40_000, 63_000, 35_000], 1),
  ];
  for (const unnamed of [null, ""]) {
    const { isBest, perSession } = sectorBests(laps, [
      session("Spa"),
      session(unnamed),
    ]);
    expect(perSession).toBe(false);
    expect(isBest(laps[0], 0)).toBe(false);
    expect(isBest(laps[1], 0)).toBe(true);
  }
});
it("detects whether any lap has sectors", () => {
  expect(hasSectors([])).toBe(false);
  expect(hasSectors([timed(0, null), lap(1, { gap: true })])).toBe(false);
  expect(hasSectors([timed(0, null), lap(1)])).toBe(true);
});
