import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { MulticlassRelativeViewModel } from "../../../widget-types/multiclass-relative/multiclass-relative-view-model";
import { MulticlassRelativeCrystal } from "./MulticlassRelativeCrystal";
afterEach(() => cleanup());
const model: MulticlassRelativeViewModel = { type: "multiclass-relative", status: "ready", rows: [{ place: 1, classId: "HYPERCAR", classColor: "#fff", number: "7", name: "PORSCHE", isPlayer: false }], rowCount: 5, classMode: "all", showClassDivider: true };
describe("MulticlassRelativeCrystal", () => { it("renders the Crystal relative table", () => { const { container } = render(<MulticlassRelativeCrystal model={model} settings={{}} renderMode="harness" />); expect(container.querySelector('[data-widget-system="vantare-crystal"]')).toBeTruthy(); }); });
