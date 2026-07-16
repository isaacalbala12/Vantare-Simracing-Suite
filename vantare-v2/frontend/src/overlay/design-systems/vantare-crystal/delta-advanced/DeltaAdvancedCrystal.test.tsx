import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { DeltaAdvancedViewModel } from "../../../widget-types/delta-advanced/delta-advanced-view-model";
import { DeltaAdvancedCrystal } from "./DeltaAdvancedCrystal";
afterEach(() => cleanup());
const model: DeltaAdvancedViewModel = { type: "delta-advanced", status: "ready", best: -0.15, availability: { best: true, sector: false, theoretical: false, last: false }, showUnavailableFields: true };
describe("DeltaAdvancedCrystal", () => { it("renders the section 16 advanced delta structure", () => { const { container } = render(<DeltaAdvancedCrystal model={model} settings={{}} renderMode="harness" />); const root = container.querySelector('[data-widget-system="vantare-crystal"]') as HTMLElement; expect(root.querySelector(".vc-delta-advanced-best")).toBeTruthy(); expect(root.textContent).toContain("THEORETICAL"); }); });
