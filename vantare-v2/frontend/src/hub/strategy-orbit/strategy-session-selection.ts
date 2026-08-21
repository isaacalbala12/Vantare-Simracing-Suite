import type {
  StrategyApplicationClient,
  StrategyEventV2,
  StrategySessionCombinationV1,
  StrategySourcedV2,
} from "../../strategy/strategy-application-client";
import type { StrategyEventRecord } from "./strategy-events-store";

export type StrategySessionCatalogView = {
  readonly status: "available" | "no_authorized_telemetry";
  readonly repositoryVersion: number;
  readonly combinations: readonly StrategySessionCombinationV1[];
  readonly events: readonly StrategyEventV2[];
};

let sessionCommandSequence = 0;

function sessionCommandId(prefix: string): string {
  sessionCommandSequence += 1;
  return `${prefix}-${Date.now()}-${sessionCommandSequence}`;
}

export async function loadStrategySessionCatalog(
  client: StrategyApplicationClient<unknown>,
): Promise<StrategySessionCatalogView> {
  const catalog = await client.execute({
    protocolVersion: "strategy.application.v1",
    commandId: sessionCommandId("orbit-session-catalog"),
    operation: "list_session_combinations",
    expectedRepositoryVersion: 0,
  });
  const events = await client.execute({
    protocolVersion: "strategy.application.v1",
    commandId: sessionCommandId("orbit-session-events"),
    operation: "list_events",
    expectedRepositoryVersion: catalog.repositoryVersion,
  });
  return {
    status: catalog.sessionCatalogStatus ?? "no_authorized_telemetry",
    repositoryVersion: events.repositoryVersion,
    combinations: catalog.sessionCombinations ?? [],
    events: events.events ?? [],
  };
}

export async function persistStrategySessionSelection(
  client: StrategyApplicationClient<unknown>,
  view: StrategySessionCatalogView,
  record: StrategyEventRecord,
  combination: StrategySessionCombinationV1,
  sessions: readonly { readonly sessionId: string; readonly included: boolean }[],
): Promise<StrategySessionCatalogView> {
  const existing = view.events.find((event) => event.id === record.id);
  const event: StrategyEventV2 = {
    ...(existing ?? strategyEventV2FromRecord(record)),
    combination: { combinationId: combination.combinationId, sessions },
  };
  const result = await client.execute({
    protocolVersion: "strategy.application.v1",
    commandId: sessionCommandId("orbit-session-save"),
    operation: existing ? "edit_event" : "create_event",
    expectedRepositoryVersion: view.repositoryVersion,
    event,
    updatedAt: new Date().toISOString(),
  });
  const savedEvents = result.strategyDocument?.events ?? result.events ?? [];
  return { ...view, repositoryVersion: result.repositoryVersion, events: savedEvents };
}

export function selectedCombination(
  view: StrategySessionCatalogView,
  eventId: string,
): StrategySessionCombinationV1 | undefined {
  const reference = view.events.find((event) => event.id === eventId)?.combination;
  return view.combinations.find((combination) => combination.combinationId === reference?.combinationId);
}

export function selectedSessions(
  view: StrategySessionCatalogView,
  eventId: string,
  combination: StrategySessionCombinationV1,
): readonly { readonly sessionId: string; readonly included: boolean }[] {
  const saved = view.events.find((event) => event.id === eventId)?.combination?.sessions;
  if (saved) return saved;
  return combination.sessions.map((session) => ({ sessionId: session.sessionId, included: session.defaultIncluded }));
}

const evidence = {
  provenance: { kind: "manual" as const, sourceId: "orbit.f5a" },
  confidence: { level: "high" as const, basis: "user input" },
};

function sourced<T>(value: T): StrategySourcedV2<T> {
  return { value, evidence };
}

function strategyEventV2FromRecord(record: StrategyEventRecord): StrategyEventV2 {
  return {
    id: record.id,
    name: sourced(record.name),
    source: sourced(record.source),
    ...(record.seriesId ? { seriesId: sourced(record.seriesId) } : {}),
    track: sourced(record.track),
    cls: sourced(record.cls),
    durationMin: sourced(record.durationMin),
    startAt: sourced(record.startAt),
    ...(record.team ? { team: sourced(record.team) } : {}),
    drivers: record.drivers.map((driver, order) => ({
      id: driver.id,
      order,
      name: sourced(driver.name),
      ini: sourced(driver.ini),
      color: sourced(driver.color),
      cls: sourced(driver.cls),
      rawExtra: { dry: driver.dry, wet: driver.wet, eco: driver.eco },
    })),
    tankLiters: sourced(record.tankL),
    pitLossSeconds: sourced(record.pitLossSec),
    strategies: record.strategies.map((variant) => ({
      id: variant.id,
      name: sourced(variant.name),
      note: sourced(variant.note),
      mode: sourced(variant.mode === "wet" ? "wet" as const : variant.mode === "eco" ? "eco" as const : "dry" as const),
      order: variant.order,
      state: sourced(variant.state),
      overrides: variant.overrides,
      tyres: variant.tyres,
    })),
    availability: Object.fromEntries(
      Object.entries(record.availability ?? {}).map(([driverId, windows]) => [
        driverId,
        windows
          .filter((window) => window.state === "ok" || window.state === "no")
          .map((window) => ({ state: window.state as "ok" | "no", from: window.from, to: window.to })),
      ]),
    ),
    ...(record.activeStrategyId ? { activeStrategyId: record.activeStrategyId } : {}),
    ...(record.teamMode ? { teamMode: sourced(record.teamMode) } : {}),
    fillMode: sourced("manual"),
    ...(record.lastOpenedAt ? { lastOpenedAt: sourced(record.lastOpenedAt) } : {}),
    tyreInventory: { sets: [], byCompound: {} },
  };
}
