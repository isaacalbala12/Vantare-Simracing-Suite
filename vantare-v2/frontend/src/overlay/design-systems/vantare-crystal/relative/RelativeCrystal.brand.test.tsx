import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  createDefaultRelativeContent,
  getEnabledRelativeColumns,
} from "../../../widget-types/relative/relative-content";
import type {
  RelativeRowViewModel,
  RelativeViewModel,
} from "../../../widget-types/relative/relative-view-model";
import { RelativeCrystal } from "./RelativeCrystal";

afterEach(() => cleanup());

function relativeRow(
  row: Pick<RelativeRowViewModel, "id" | "position" | "driverName"> &
    Partial<RelativeRowViewModel>,
): RelativeRowViewModel {
  return {
    vehicleClass: "HYPERCAR",
    driverNumber: "",
    gapText: "—",
    bestLapText: "-",
    lastLapText: "-",
    isPlayer: false,
    side: "ahead",
    tone: "neutral",
    gapSeconds: null,
    ...row,
  };
}

const readyModel: RelativeViewModel = {
  type: "relative",
  status: "ready",
  columns: getEnabledRelativeColumns(createDefaultRelativeContent()),
  rowHeightMode: "compact",
  rows: [relativeRow({ id: "4", position: 4, driverName: "Player", isPlayer: true })],
};

function brandNodes(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll("[data-crystal-primitive='brand']")];
}

describe("RelativeCrystal brand decision", () => {
  it("keeps the legacy header brand without an explicit decision", () => {
    const { container } = render(
      <RelativeCrystal model={readyModel} settings={{ showHeader: true }} renderMode="harness" />,
    );
    expect(brandNodes(container)).toHaveLength(2);
  });

  it("mandatory brand survives a hidden header in its own band", () => {
    const { container } = render(
      <RelativeCrystal
        model={readyModel}
        settings={{ showHeader: false, showBrand: false, brandVisible: true }}
        renderMode="harness"
      />,
    );
    expect(container.querySelector(".vc-relative-header")).toBeNull();
    expect(container.querySelector(".vc-brand-band")).toBeTruthy();
    expect(brandNodes(container)).toHaveLength(2);
  });

  it("paid opt-out hides the brand everywhere", () => {
    const visible = render(
      <RelativeCrystal
        model={readyModel}
        settings={{ showHeader: true, brandVisible: false }}
        renderMode="harness"
      />,
    );
    expect(brandNodes(visible.container)).toHaveLength(0);
    visible.unmount();
    const hidden = render(
      <RelativeCrystal
        model={readyModel}
        settings={{ showHeader: false, brandVisible: false }}
        renderMode="harness"
      />,
    );
    expect(brandNodes(hidden.container)).toHaveLength(0);
  });
});
