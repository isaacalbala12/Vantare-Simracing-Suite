import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { DeltaAdvancedViewModel } from "../../../widget-types/delta-advanced/delta-advanced-view-model";
import { DeltaAdvancedOriginal } from "./DeltaAdvancedOriginal";
afterEach(() => cleanup());
const model: DeltaAdvancedViewModel = { type: "delta-advanced", status: "ready", best: -0.15, availability: { best: true, sector: false, theoretical: false, last: false }, showUnavailableFields: true };
describe("DeltaAdvancedOriginal", () => { it("renders live best and honest unavailable fields", () => { const { container } = render(<DeltaAdvancedOriginal model={model} settings={{}} renderMode="harness" />); expect(container.textContent).toContain("-0.150"); expect(container.textContent).toContain("SECTOR —"); }); });
