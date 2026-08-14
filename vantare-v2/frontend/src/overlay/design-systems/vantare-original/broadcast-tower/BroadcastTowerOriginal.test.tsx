import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { BroadcastTowerViewModel } from "../../../widget-types/broadcast-tower/broadcast-tower-view-model";
import { BroadcastTowerOriginal } from "./BroadcastTowerOriginal";

afterEach(() => cleanup());

const row = {
  place: 1,
  number: "7",
  name: "Driver",
  team: "Team",
  className: "HYPERCAR",
  isPlayer: true,
};

const model: BroadcastTowerViewModel = {
  type: "broadcast-tower",
  status: "ready",
  sessionLabel: "RACE",
  rows: [row],
  rowCount: 5,
  showWeather: false,
  showSof: false,
};

describe("BroadcastTowerOriginal", () => {
  it("renders a functional standings tower", () => {
    const view = render(
      <BroadcastTowerOriginal model={model} settings={{}} renderMode="harness" />,
    );
    expect(view.container.querySelectorAll(".vo-broadcast-tower-rows > div")).toHaveLength(1);
    expect(view.container.textContent).toContain("Driver");
  });

  it("sizes its visible shell from the live driver count", () => {
    const view = render(
      <BroadcastTowerOriginal model={{ ...model, rows: [row, { ...row, place: 2, number: "8" }] }} settings={{}} renderMode="harness" />,
    );
    const root = view.container.querySelector('[data-widget-renderer="broadcast-tower"]');
    expect(root?.getAttribute("data-driver-count")).toBe("2");
    expect(root?.getAttribute("data-visible-rows")).toBe("2");
  });

  it("keeps a deliberate one-row state without telemetry drivers", () => {
    const view = render(
      <BroadcastTowerOriginal model={{ ...model, rows: [] }} settings={{}} renderMode="harness" />,
    );
    const root = view.container.querySelector('[data-widget-renderer="broadcast-tower"]');
    expect(root?.getAttribute("data-driver-count")).toBe("0");
    expect(root?.getAttribute("data-visible-rows")).toBe("1");
    expect(view.container.querySelector(".vo-broadcast-empty-row")).toBeTruthy();
  });
});
