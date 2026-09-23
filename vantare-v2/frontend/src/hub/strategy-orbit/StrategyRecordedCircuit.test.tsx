import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { StrategyRecordedCircuit } from "./StrategyRecordedCircuit";

afterEach(cleanup);
const t = (key: string) => key;
const combination = (trackName: string, trackLayout = trackName, simId = "lmu") => ({
  combinationId: `${simId}:${trackName}`, simId, trackName, trackLayout, carName: "Car", carClass: "LMP2",
});

it("draws distinct real catalog outlines for verified COTA and Monza identities", () => {
  const view = render(<StrategyRecordedCircuit combination={combination("Circuit of the Americas")} t={t} />);
  const cota = screen.getByRole("img", { name: "strategy.entry.catalogMap" }).querySelector("path")?.getAttribute("d");
  expect(cota).toMatch(/^M /);
  expect(screen.getByText("strategy.entry.catalogMapSource")).toBeTruthy();
  view.rerender(<StrategyRecordedCircuit combination={combination("Autodromo Nazionale Monza")} t={t} />);
  const monza = screen.getByRole("img", { name: "strategy.entry.catalogMap" }).querySelector("path")?.getAttribute("d");
  expect(monza).toMatch(/^M /);
  expect(monza).not.toBe(cota);
});

it.each([
  ["unknown simulator", combination("Circuit of the Americas", "Circuit of the Americas", "acc")],
  ["different layout", combination("Circuit of the Americas", "Grand Prix")],
  ["unknown layout", combination("Circuit of the Americas", "")],
  ["synthetic geometry", combination("Vantare Reference Loop")],
  ["unknown track", combination("Uncatalogued Track")],
])("keeps %s without an invented outline", (_name, selected) => {
  render(<StrategyRecordedCircuit combination={selected} t={t} />);
  expect(screen.queryByRole("img", { name: "strategy.entry.catalogMap" })).toBeNull();
  expect(screen.getByText("strategy.entry.mapUnavailable")).toBeTruthy();
});
