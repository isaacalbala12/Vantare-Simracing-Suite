import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { BroadcastTowerViewModel } from "../../../widget-types/broadcast-tower/broadcast-tower-view-model";
import { BroadcastTowerOriginal } from "./BroadcastTowerOriginal";
afterEach(() => cleanup());
const model: BroadcastTowerViewModel = { type: "broadcast-tower", status: "ready", sessionLabel: "RACE", lap: 14, rows: [{ place: 1, number: "7", name: "PORSCHE", team: "PORSCHE", className: "HYPERCAR", isPlayer: false }], rowCount: 5, showWeather: true, showSof: true };
describe("BroadcastTowerOriginal", () => { it("renders a functional standings tower", () => { const { container } = render(<BroadcastTowerOriginal model={model} settings={{}} renderMode="harness" />); expect(container.querySelectorAll(".vo-broadcast-tower-rows > div")).toHaveLength(1); expect(container.textContent).toContain("PORSCHE"); }); });
