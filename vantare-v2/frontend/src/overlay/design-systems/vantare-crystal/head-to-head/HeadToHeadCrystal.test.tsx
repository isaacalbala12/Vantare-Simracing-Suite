import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { HeadToHeadViewModel } from "../../../widget-types/head-to-head/head-to-head-view-model";
import { HeadToHeadCrystal } from "./HeadToHeadCrystal";
afterEach(() => cleanup());
const model: HeadToHeadViewModel = { type: "head-to-head", status: "missing", statusMessage: "No nearby rival", sectorComparisons: [], target: "ahead", showSectors: true };
describe("HeadToHeadCrystal", () => { it("keeps missing rival inside the Crystal frame", () => { const { container } = render(<HeadToHeadCrystal model={model} settings={{}} renderMode="harness" />); const root = container.querySelector('[data-widget-system="vantare-crystal"]') as HTMLElement; expect(root.getAttribute("data-status")).toBe("missing"); expect(root.textContent).toContain("No nearby rival"); }); });

it("renders only comparisons supplied by the ViewModel", () => {
  const entry = { place: 4, number: "36", name: "PLAYER", team: "ALPINE", className: "HYPERCAR", isPlayer: true };
  const { container } = render(<HeadToHeadCrystal model={{ ...model, status: "ready", statusMessage: undefined, player: entry, opponent: { ...entry, place: 3, name: "RIVAL", isPlayer: false }, gapSeconds: 1.84, sectorComparisons: [] }} settings={{}} renderMode="harness" />);
  expect(container.textContent).toContain("1.840");
  expect(container.textContent).not.toContain("LEADER");
  expect(container.textContent).not.toContain("S1 - S2");
});
