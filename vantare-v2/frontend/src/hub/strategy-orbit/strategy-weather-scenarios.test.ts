import { describe, expect, it } from "vitest";
import type {
  StrategyApplicationClient,
  StrategyApplicationCommandV1,
  StrategyApplicationResultV1,
  StrategyEventV2,
} from "../../strategy/strategy-application-client";
import type { StrategyEventRecord } from "./strategy-events-store";
import {
  createManualWeatherScenario,
  persistStrategyWeatherScenarios,
  selectedWeatherScenarios,
} from "./strategy-weather-scenarios";

describe("escenarios de clima de Orbit", () => {
  it("crea cinco nodos secos declarados como manuales", () => {
    const created = createManualWeatherScenario("event-1", "lmu:imola", "weather-1", new Date("2026-08-22T12:00:00.000Z"));
    expect(created.weight).toBe(1);
    expect(created.scenario.nodes.map((node) => node.progress)).toEqual(["START", "25", "50", "75", "FINISH"]);
    expect(created.scenario.nodes.every((node) => node.rainChance === 0)).toBe(true);
    expect(created.scenario.provenance.source).toBe("manual");
  });

  it("persiste el conjunto completo en el evento canónico", async () => {
    const scenarios = [createManualWeatherScenario("event-1", "manual:event-1", "weather-1", new Date("2026-08-22T12:00:00.000Z"))];
    const existing = { id: "event-1", weatherScenarios: [] } as unknown as StrategyEventV2;
    let saved: StrategyEventV2 | undefined;
    const client: StrategyApplicationClient<unknown> = {
      async execute(command: StrategyApplicationCommandV1<unknown>): Promise<StrategyApplicationResultV1<unknown>> {
        if (command.operation !== "edit_event") throw new Error(`unexpected ${command.operation}`);
        saved = command.event;
        return {
          protocolVersion: "strategy.application.v1", commandId: command.commandId, repositoryVersion: 4,
          strategyDocument: { contractVersion: "strategy.v2", schemaVersion: "2.0.0", generatedAt: command.updatedAt, events: [command.event] },
          recoveredFromBackup: false, closed: false,
        };
      },
      cancel: () => false,
      dispose: () => undefined,
    };
    const view = { status: "no_authorized_telemetry" as const, repositoryVersion: 3, combinations: [], events: [existing], planningByEvent: {}, planningStatusByEvent: {} };
    const next = await persistStrategyWeatherScenarios(client, view, { id: "event-1" } as StrategyEventRecord, scenarios);
    expect(saved?.weatherScenarios).toEqual(scenarios);
    expect(selectedWeatherScenarios(next, "event-1")).toEqual(scenarios);
  });
});
