import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { RacingFlagsViewModel } from "../../../widget-types/racing-flags/racing-flags-view-model";
import { RacingFlagsCrystal } from "./RacingFlagsCrystal";
afterEach(() => cleanup());
const model: RacingFlagsViewModel = { type: "racing-flags", status: "ready", globalFlag: "yellow", sectorFlags: ["yellow", "green", "yellow"], message: "YELLOW", showSectorFlags: true, hideWhenGreen: false, hidden: false };
describe("RacingFlagsCrystal", () => { it("renders a Crystal flag card", () => { const { container } = render(<RacingFlagsCrystal model={model} settings={{}} renderMode="harness" />); const root = container.querySelector('[data-widget-system="vantare-crystal"]') as HTMLElement; expect(root.querySelector(".vc-racing-flags-top")).toBeTruthy(); expect(root.querySelectorAll("[data-sector]")).toHaveLength(3); }); });
