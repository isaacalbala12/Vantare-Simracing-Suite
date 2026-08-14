import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { BroadcastTowerViewModel } from "../../../widget-types/broadcast-tower/broadcast-tower-view-model";
import { BroadcastTowerCrystal } from "./BroadcastTowerCrystal";
afterEach(() => cleanup());
const model: BroadcastTowerViewModel = { type: "broadcast-tower", status: "ready", sessionLabel: "RACE", rows: [{ place: 1, number: "7", name: "PORSCHE", team: "PORSCHE", className: "HYPERCAR", isPlayer: false }], rowCount: 5, showWeather: true, showSof: true };
describe("BroadcastTowerCrystal", () => { it("renders the canonical horizontal stream without inventing live values", () => { const { container } = render(<BroadcastTowerCrystal model={model} settings={{}} renderMode="harness" />); expect(container.querySelector(".vc-broadcast-lap")).toBeTruthy(); expect(container.querySelectorAll(".vc-broadcast-stream article")).toHaveLength(1); expect(container.textContent).toContain("ASFALTO —"); expect(container.textContent).not.toContain("LÍDER"); }); });

it("shrinks to the effective driver count and keeps a one-row empty state", () => {
  const one = render(<BroadcastTowerCrystal model={model} settings={{}} renderMode="harness" />);
  const oneRoot = one.container.querySelector('[data-widget-renderer="broadcast-tower"]');
  expect(oneRoot?.getAttribute("data-driver-count")).toBe("1");
  expect(oneRoot?.getAttribute("data-visible-rows")).toBe("1");
  cleanup();

  const empty = render(
    <BroadcastTowerCrystal model={{ ...model, rows: [] }} settings={{}} renderMode="harness" />,
  );
  const emptyRoot = empty.container.querySelector('[data-widget-renderer="broadcast-tower"]');
  expect(emptyRoot?.getAttribute("data-driver-count")).toBe("0");
  expect(emptyRoot?.getAttribute("data-visible-rows")).toBe("1");
  expect(empty.container.querySelector(".vc-broadcast-empty-row")).toBeTruthy();
});
