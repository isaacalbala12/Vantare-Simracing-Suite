import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { BroadcastTowerViewModel } from "../../../widget-types/broadcast-tower/broadcast-tower-view-model";
import { BroadcastTowerCrystal } from "./BroadcastTowerCrystal";
afterEach(() => cleanup());
const model: BroadcastTowerViewModel = { type: "broadcast-tower", status: "ready", sessionLabel: "RACE", rows: [{ place: 1, number: "7", name: "PORSCHE", team: "PORSCHE", className: "HYPERCAR", isPlayer: false }], rowCount: 5, showWeather: true, showSof: true };
describe("BroadcastTowerCrystal", () => { it("renders the broadcast table and honest unavailable footer fields", () => { const { container } = render(<BroadcastTowerCrystal model={model} settings={{}} renderMode="harness" />); expect(container.querySelector('[data-widget-system="vantare-crystal"]')).toBeTruthy(); expect(container.textContent).toContain("TRACK TEMP —"); }); });
