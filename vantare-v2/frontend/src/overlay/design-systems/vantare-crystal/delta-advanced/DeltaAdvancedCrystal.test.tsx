import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { DeltaAdvancedViewModel } from "../../../widget-types/delta-advanced/delta-advanced-view-model";
import { DeltaAdvancedCrystal } from "./DeltaAdvancedCrystal";
afterEach(() => cleanup());
it("hides unavailable fields when requested", () => {
  const { container } = render(<DeltaAdvancedCrystal model={{ ...model, showUnavailableFields: false }} settings={{}} renderMode="harness" />);
  expect(container.querySelectorAll('[data-tone]')).toHaveLength(1);
  expect(container.textContent).toContain("Delta");
});
const model: DeltaAdvancedViewModel = { type: "delta-advanced", status: "ready", best: -0.15, availability: { best: true, sector: false, theoretical: false, last: false }, showUnavailableFields: true };
describe("DeltaAdvancedCrystal", () => { it("renders the four canonical section 16 cells without inventing unavailable values", () => { const { container } = render(<DeltaAdvancedCrystal model={model} settings={{}} renderMode="harness" />); const root = container.querySelector('[data-widget-system="vantare-crystal"]') as HTMLElement; expect([...root.querySelectorAll("i")].map((node) => node.textContent)).toEqual(["Delta", "Sector", "Teórica", "Última"]); expect([...root.querySelectorAll(":scope > div")].map((node) => node.getAttribute("data-tone"))).toEqual(["b", "s", "t", "l"]); expect(root.textContent).toContain("-0.150"); expect(root.textContent?.match(/Sin dato/g)).toHaveLength(3); }); });
