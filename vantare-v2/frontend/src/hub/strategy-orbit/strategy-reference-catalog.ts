import type {
  StrategyApplicationClient,
  StrategyEventV2,
  StrategyReferenceCatalogResultV1,
  StrategyReferenceStrategyV1,
  StrategySourcedV2,
} from "../../strategy/strategy-application-client";
import type { StrategyEventRecord } from "./strategy-events-store";
import { strategyEventV2FromRecord } from "./strategy-session-selection";

type ReferenceCombination = StrategyReferenceCatalogResultV1["catalog"]["combinations"][number];

let referenceSequence = 0;

function commandId(): string {
  referenceSequence += 1;
  return `orbit-reference-${Date.now()}-${referenceSequence}`;
}

export async function loadReferenceCatalog(
  client: StrategyApplicationClient<unknown>,
  repositoryVersion: number,
): Promise<StrategyReferenceCatalogResultV1 | undefined> {
  const result = await client.execute({ protocolVersion: "strategy.application.v1", commandId: commandId(), operation: "list_reference_catalog", expectedRepositoryVersion: repositoryVersion });
  return result.referenceCatalog;
}

export async function applyReferenceProfile(
  client: StrategyApplicationClient<unknown>,
  repositoryVersion: number,
  existing: StrategyEventV2 | undefined,
  record: StrategyEventRecord,
  combination: ReferenceCombination,
): Promise<StrategyEventV2> {
  const profile = combination.referenceProfile;
  if (!profile) throw new Error("Reference profile is unavailable");
  const event = existing ?? strategyEventV2FromRecord(record);
  const overrides = { ...(event.planningInputs?.overrides ?? {}) };
  const sourceId = `catalog:${combination.combinationId}:profile`;
  if (profile.fuel) overrides.fuel_per_lap_liters = referenceOverride(profile.fuel.medianPerLap, profile.fuel.sampleLaps, sourceId);
  if (profile.virtualEnergy) overrides.ve_per_lap_percent = referenceOverride(profile.virtualEnergy.medianPerLap, profile.virtualEnergy.sampleLaps, sourceId);
  if (profile.pit) overrides.pit_loss_seconds = referenceOverride(profile.pit.typicalDurationSeconds, profile.sample.sessions, sourceId);
  return persistEvent(client, repositoryVersion, existing !== undefined, { ...event, planningInputs: { ...event.planningInputs, overrides } });
}

export async function applyReferenceStrategy(
  client: StrategyApplicationClient<unknown>,
  repositoryVersion: number,
  existing: StrategyEventV2 | undefined,
  record: StrategyEventRecord,
  strategy: StrategyReferenceStrategyV1,
): Promise<StrategyEventV2> {
  const event = existing ?? strategyEventV2FromRecord(record);
  const id = `reference-${strategy.clusterDigest.slice(0, 16)}`;
  const variant = {
    id,
    name: sourced(`Referencia #${strategy.rank}`, `catalog:${strategy.clusterDigest}`),
    note: sourced(`k=${strategy.sample.contributors}`, `catalog:${strategy.clusterDigest}`),
    mode: sourced("dry" as const, `catalog:${strategy.clusterDigest}`),
    order: event.drivers.map((driver) => driver.id),
    state: sourced("draft" as const, `catalog:${strategy.clusterDigest}`),
    overrides: { referenceCatalog: { clusterDigest: strategy.clusterDigest, stintCount: strategy.representative.stintCount, pitLaps: strategy.representative.pitLaps, compounds: strategy.representative.compounds } },
    tyres: {},
  };
  const strategies = [...event.strategies.filter((candidate) => candidate.id !== id), variant];
  return persistEvent(client, repositoryVersion, existing !== undefined, { ...event, strategies });
}

function referenceOverride(value: number, sampleSize: number, sourceId: string) {
  return { value, presence: "valid" as const, provenance: { kind: "reference" as const, sourceId }, confidence: { sampleSize, computationVersion: "strategy.catalog.payload.v1" } };
}

function sourced<T>(value: T, sourceId: string): StrategySourcedV2<T> {
  return { value, evidence: { provenance: { kind: "reference", sourceId }, confidence: { level: "high", basis: "signed catalog k>=3" } } };
}

async function persistEvent(
  client: StrategyApplicationClient<unknown>,
  repositoryVersion: number,
  exists: boolean,
  event: StrategyEventV2,
): Promise<StrategyEventV2> {
  const result = await client.execute({ protocolVersion: "strategy.application.v1", commandId: commandId(), operation: exists ? "edit_event" : "create_event", expectedRepositoryVersion: repositoryVersion, event, updatedAt: new Date().toISOString() });
  return result.strategyDocument?.events.find((candidate) => candidate.id === event.id) ?? event;
}
