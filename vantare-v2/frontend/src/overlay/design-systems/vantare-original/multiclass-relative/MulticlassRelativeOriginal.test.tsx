import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { MulticlassRelativeViewModel } from "../../../widget-types/multiclass-relative/multiclass-relative-view-model";
import { MulticlassRelativeOriginal } from "./MulticlassRelativeOriginal";
afterEach(() => cleanup());
const model: MulticlassRelativeViewModel = { type: "multiclass-relative", status: "ready", rows: [{ place: 1, classId: "HYPERCAR", classColor: "#fff", number: "7", name: "PORSCHE", isPlayer: false }, { place: 5, classId: "HYPERCAR", classColor: "#fff", number: "5", name: "TOYOTA", isPlayer: true }], rowCount: 5, classMode: "all", showClassDivider: true };
describe("MulticlassRelativeOriginal", () => { it("renders class-colored relative rows", () => { const { container } = render(<MulticlassRelativeOriginal model={model} settings={{}} renderMode="harness" />); expect(container.querySelectorAll("[data-class]")).toHaveLength(2); }); });
