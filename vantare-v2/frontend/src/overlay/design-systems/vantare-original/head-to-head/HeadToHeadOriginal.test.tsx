import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { HeadToHeadViewModel } from "../../../widget-types/head-to-head/head-to-head-view-model";
import { HeadToHeadOriginal } from "./HeadToHeadOriginal";
afterEach(() => cleanup());
const model: HeadToHeadViewModel = { type: "head-to-head", status: "ready", player: { place: 5, number: "5", name: "TOYOTA", team: "TOYOTA", className: "HYPERCAR", isPlayer: true }, opponent: { place: 4, number: "8", name: "CADILLAC", team: "CADILLAC", className: "HYPERCAR", isPlayer: false }, gapSeconds: 0.42, sectorComparisons: [], target: "ahead", showSectors: true };
describe("HeadToHeadOriginal", () => { it("renders player and immediate rival", () => { const { container } = render(<HeadToHeadOriginal model={model} settings={{}} renderMode="harness" />); expect(container.textContent).toContain("TOYOTA"); expect(container.textContent).toContain("CADILLAC"); }); });
