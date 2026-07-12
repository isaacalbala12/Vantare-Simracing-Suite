import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { RacingFlagsViewModel } from "../../../widget-types/racing-flags/racing-flags-view-model";
import { RacingFlagsOriginal } from "./RacingFlagsOriginal";
afterEach(() => cleanup());
const model: RacingFlagsViewModel = { type: "racing-flags", status: "ready", globalFlag: "yellow", sectorFlags: ["yellow", "green", "yellow"], message: "YELLOW", showSectorFlags: true, hideWhenGreen: false, hidden: false };
describe("RacingFlagsOriginal", () => { it("renders the flag and sectors", () => { const { container } = render(<RacingFlagsOriginal model={model} settings={{}} renderMode="harness" />); const root = container.querySelector('[data-widget-system="vantare-original"]') as HTMLElement; expect(root.getAttribute("data-widget-renderer")).toBe("racing-flags"); expect(root.textContent).toContain("YELLOW"); expect(root.querySelectorAll("[data-sector]")).toHaveLength(3); }); });
