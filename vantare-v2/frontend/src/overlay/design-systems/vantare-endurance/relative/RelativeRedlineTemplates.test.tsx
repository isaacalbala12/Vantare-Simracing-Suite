import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type {
  RelativeRowViewModel,
  RelativeViewModel,
} from "../../../widget-types/relative/relative-view-model";
import { RelativeRedlineTemplate } from "./RelativeRedlineTemplates";

afterEach(() => cleanup());

function row(
  id: string,
  side: RelativeRowViewModel["side"],
  isPlayer = false,
): RelativeRowViewModel {
  return {
    id,
    position: 1,
    vehicleClass: "HYPERCAR",
    driverNumber: "7",
    driverName: id,
    gapText: "—",
    bestLapText: "—",
    lastLapText: "—",
    isPlayer,
    side,
    tone: isPlayer ? "player" : "neutral",
    gapSeconds: isPlayer ? 0 : null,
  };
}

const neutralPitModel: RelativeViewModel = {
  type: "relative",
  status: "ready",
  columns: [],
  rowHeightMode: "compact",
  rows: [
    row("ahead-far", "ahead"),
    row("ahead-near", "ahead"),
    row("player", "player", true),
    row("behind-near", "behind"),
    row("behind-far", "behind"),
  ],
};

describe("RelativeRedlineTemplate", () => {
  it("keeps neutral pit rows on their physical side in mirror", () => {
    const { container } = render(
      <RelativeRedlineTemplate
        model={neutralPitModel}
        settings={{}}
        variant="mirror"
        showHeader={false}
      />,
    );

    expect(
      container.querySelector('[data-relative-row="ahead-near"] .ven-rel-gap')?.getAttribute("data-side"),
    ).toBe("ahead");
    expect(
      container.querySelector('[data-relative-row="behind-near"] .ven-rel-gap')?.getAttribute("data-side"),
    ).toBe("behind");
    expect(container.querySelectorAll("[data-relative-row]")).toHaveLength(5);
  });

  it("keeps neutral pit rows on their physical side in proximity", () => {
    const { container } = render(
      <RelativeRedlineTemplate
        model={neutralPitModel}
        settings={{}}
        variant="proximity"
        showHeader={false}
      />,
    );

    expect(
      container.querySelector('[data-relative-row="ahead-near"] .ven-rel-gapcell')?.getAttribute("data-side"),
    ).toBe("ahead");
    expect(
      container.querySelector('[data-relative-row="behind-near"] .ven-rel-gapcell')?.getAttribute("data-side"),
    ).toBe("behind");
  });
});
