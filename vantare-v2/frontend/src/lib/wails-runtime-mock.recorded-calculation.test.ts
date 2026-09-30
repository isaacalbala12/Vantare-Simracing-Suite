import { afterEach, expect, it } from "vitest";
import type { StrategyOrbitCalculationInputV1 } from "../strategy/strategy-application-client";
import { createStrategyApplicationClient } from "../strategy/strategy-application-client";
import { recordedPitComparisonInput } from "../hub/strategy-orbit/strategy-recorded-pit-constraints";
import { Events } from "./wails-runtime-mock";

const client = createStrategyApplicationClient<unknown>({ emit: (name, payload) => Events.Emit(name, payload), on: (name, listener) => Events.On(name, listener) }, 2_000);
afterEach(() => window.localStorage.clear());

it.each(["applicable", "not_applicable"] as const)("keeps %s resources consistent through a pit edit without a tyre inventory", async applicability => {
  const input = {
    event: { tankLiters: 100, virtualEnergy: { applicability } },
    drivers: [{ id: "driver", paceDeltaSeconds: 0 }],
    variants: [{ id: "recorded-main", mode: "dry", order: ["driver"], overrides: {} }],
    activeVariantId: "recorded-main",
  } as StrategyOrbitCalculationInputV1;
  const result = await client.execute({ protocolVersion: "strategy.application.v1", commandId: `mock-pit-${applicability}`, operation: "calculate_orbit", expectedRepositoryVersion: 0, input });
  const calculation = result.orbitCalculation;
  if (!calculation) throw new Error("Expected a visual-harness calculation");
  const plan = calculation.plans["recorded-main"];
  expect(plan.stopDetails).toHaveLength(2);
  expect(plan.stopDetails.every(stop => stop.changeTyres === undefined && stop.compound === undefined)).toBe(true);
  expect(plan.stints.every(stint => stint.compound === undefined && stint.tyreFitment === undefined)).toBe(true);
  expect(plan.stopDetails.every(stop => (stop.virtualEnergyInPercent !== undefined) === (applicability === "applicable"))).toBe(true);
  expect(() => recordedPitComparisonInput({ status: "success", input, result: calculation }, plan.stopDetails.map((_, index) => ({ index, fuelLiters: 63 })))).not.toThrow();
});
