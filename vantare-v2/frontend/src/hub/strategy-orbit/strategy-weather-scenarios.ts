import type {
  StrategyApplicationClient,
  StrategyEventV2,
  StrategyWeatherNodeProgressV1,
  StrategyWeightedWeatherScenarioV1,
} from "../../strategy/strategy-application-client";
import type { StrategyEventRecord } from "./strategy-events-store";
import { strategyEventV2FromRecord, type StrategySessionCatalogView } from "./strategy-session-selection";

const progress: readonly StrategyWeatherNodeProgressV1[] = ["START", "25", "50", "75", "FINISH"];

export function createManualWeatherScenario(
  eventId: string,
  combinationId: string,
  scenarioId: string,
  now = new Date(),
): StrategyWeightedWeatherScenarioV1 {
  const generatedAt = now.toISOString();
  return {
    weight: 1,
    scenario: {
      contractVersion: "weatherscenario.v1",
      scenarioId,
      combinationId: combinationId || `manual:${eventId}`,
      generatedAt,
      nodes: progress.map((nodeProgress) => ({ progress: nodeProgress, rainChance: 0, sky: "clear" as const, airTempC: 20, trackTempC: 25 })) as unknown as StrategyWeightedWeatherScenarioV1["scenario"]["nodes"],
      provenance: {
        source: "manual",
        capturedAt: generatedAt,
        freshUntil: new Date(now.getTime() + 1).toISOString(),
        sessionType: "manual",
        signalFreshness: "manual",
      },
    },
  };
}

export function selectedWeatherScenarios(view: StrategySessionCatalogView, eventId: string): readonly StrategyWeightedWeatherScenarioV1[] {
  return view.events.find((event) => event.id === eventId)?.weatherScenarios ?? [];
}

export async function persistStrategyWeatherScenarios(
  client: StrategyApplicationClient<unknown>,
  view: StrategySessionCatalogView,
  record: StrategyEventRecord,
  weatherScenarios: readonly StrategyWeightedWeatherScenarioV1[],
): Promise<StrategySessionCatalogView> {
  const existing = view.events.find((event) => event.id === record.id);
  const event: StrategyEventV2 = { ...(existing ?? strategyEventV2FromRecord(record)), weatherScenarios };
  const result = await client.execute({
    protocolVersion: "strategy.application.v1",
    commandId: `orbit-weather-save-${Date.now()}`,
    operation: existing ? "edit_event" : "create_event",
    expectedRepositoryVersion: view.repositoryVersion,
    event,
    updatedAt: new Date().toISOString(),
  });
  return {
    ...view,
    repositoryVersion: result.repositoryVersion,
    events: result.strategyDocument?.events ?? result.events ?? [event],
  };
}
