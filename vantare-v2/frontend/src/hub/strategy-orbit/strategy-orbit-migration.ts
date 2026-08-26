import {
  STRATEGY_APPLICATION_PROTOCOL_V1,
  type StrategyApplicationClient,
  type StrategyLegacyMigrationPreviewV1,
  type StrategyLegacyStorageSourceV1,
} from "../../strategy/strategy-application-client";
import {
  clearStrategyEventsMigrated,
  markStrategyEventsMigrated,
  STRATEGY_EVENTS_KEY,
  STRATEGY_LEGACY_KEY,
} from "./strategy-events-store";

export type PreparedOrbitLegacyMigration = {
  readonly sources: readonly StrategyLegacyStorageSourceV1[];
  readonly migratedAt: string;
  readonly repositoryVersion: number;
  readonly preview: StrategyLegacyMigrationPreviewV1;
};

let commandSequence = 0;

function commandId(stage: string): string {
  commandSequence += 1;
  return `orbit-migration-${stage}-${commandSequence}`;
}

function utf8Base64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

/** Lee texto crudo: aquí está prohibido JSON.parse; Go decide toda la migración. */
export function readOrbitLegacySources(storage: Pick<Storage, "getItem">): readonly StrategyLegacyStorageSourceV1[] {
  return [STRATEGY_EVENTS_KEY, STRATEGY_LEGACY_KEY].map((key) => {
    const raw = storage.getItem(key);
    return { key, present: raw !== null, raw: raw === null ? "" : utf8Base64(raw) };
  });
}

export async function previewOrbitLegacyMigration(
  client: StrategyApplicationClient<unknown>,
  at = new Date(),
): Promise<PreparedOrbitLegacyMigration> {
  const listed = await client.execute({
    protocolVersion: STRATEGY_APPLICATION_PROTOCOL_V1,
    commandId: commandId("version"),
    operation: "list_events",
    expectedRepositoryVersion: 0,
  });
  const sources = readOrbitLegacySources(window.localStorage);
  const migratedAt = at.toISOString();
  const result = await client.execute({
    protocolVersion: STRATEGY_APPLICATION_PROTOCOL_V1,
    commandId: commandId("preview"),
    operation: "preview_legacy_migration",
    expectedRepositoryVersion: listed.repositoryVersion,
    sources,
    migratedAt,
  });
  if (!result.legacyMigration) throw new Error("Strategy no devolvió el preview de migración.");
  return {
    sources,
    migratedAt,
    repositoryVersion: result.repositoryVersion,
    preview: result.legacyMigration,
  };
}

export async function commitOrbitLegacyMigration(
  client: StrategyApplicationClient<unknown>,
  prepared: PreparedOrbitLegacyMigration,
): Promise<StrategyLegacyMigrationPreviewV1> {
  const result = await client.execute({
    protocolVersion: STRATEGY_APPLICATION_PROTOCOL_V1,
    commandId: commandId("commit"),
    operation: "migrate_legacy",
    expectedRepositoryVersion: prepared.repositoryVersion,
    sources: prepared.sources,
    confirmedFingerprint: prepared.preview.fingerprint,
    migratedAt: prepared.migratedAt,
  });
  if (!result.legacyMigration || (!result.legacyMigration.imported && !result.legacyMigration.alreadyImported)) {
    throw new Error("Strategy no confirmó la migración de Orbit.");
  }
  markStrategyEventsMigrated(result.legacyMigration.fingerprint, prepared.migratedAt);
  return result.legacyMigration;
}

export async function rollbackOrbitLegacyMigration(
  client: StrategyApplicationClient<unknown>,
  journalId: string,
  at = new Date(),
): Promise<StrategyLegacyMigrationPreviewV1> {
  const listed = await client.execute({
    protocolVersion: STRATEGY_APPLICATION_PROTOCOL_V1,
    commandId: commandId("rollback-version"),
    operation: "list_events",
    expectedRepositoryVersion: 0,
  });
  const result = await client.execute({
    protocolVersion: STRATEGY_APPLICATION_PROTOCOL_V1,
    commandId: commandId("rollback"),
    operation: "rollback_legacy_migration",
    expectedRepositoryVersion: listed.repositoryVersion,
    journalId,
    rolledBackAt: at.toISOString(),
  });
  if (!result.legacyMigration?.rolledBack) throw new Error("Strategy no confirmó el rollback de Orbit.");
  clearStrategyEventsMigrated();
  return result.legacyMigration;
}
