import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StrategyApplicationClient, StrategyApplicationResultV1 } from "../../strategy/strategy-application-client";
import {
  commitOrbitLegacyMigration,
  previewOrbitLegacyMigration,
  readOrbitLegacySources,
  rollbackOrbitLegacyMigration,
} from "./strategy-orbit-migration";
import {
  STRATEGY_EVENTS_KEY,
  STRATEGY_LEGACY_KEY,
  STRATEGY_MIGRATED_KEY,
  writeStrategyEvents,
} from "./strategy-events-store";

const baseResult = {
  protocolVersion: "strategy.application.v1",
  commandId: "result",
  repositoryVersion: 4,
  recoveredFromBackup: false,
  closed: false,
} as const;

describe("migración Orbit localStorage", () => {
  beforeEach(() => window.localStorage.clear());

  it("lee ambas claves sin parsear y conserva los bytes UTF-8 exactos", () => {
    window.localStorage.setItem(STRATEGY_EVENTS_KEY, " {\"nombre\":\"Málaga\"}\n");
    const sources = readOrbitLegacySources(window.localStorage);
    expect(sources.map((source) => source.key)).toEqual([STRATEGY_EVENTS_KEY, STRATEGY_LEGACY_KEY]);
    expect(new TextDecoder().decode(Uint8Array.from(atob(sources[0].raw), (char) => char.charCodeAt(0)))).toBe(" {\"nombre\":\"Málaga\"}\n");
    expect(sources[1]).toMatchObject({ key: STRATEGY_LEGACY_KEY, present: false, raw: "" });
  });

  it("hace preview, confirma el mismo fingerprint y marca el store read-only solo tras éxito", async () => {
    window.localStorage.setItem(STRATEGY_EVENTS_KEY, "{\"events\":[]}");
    const execute = vi
      .fn()
      .mockResolvedValueOnce({ ...baseResult, commandId: "list" })
      .mockResolvedValueOnce({
        ...baseResult,
        commandId: "preview",
        repositoryVersion: 5,
        legacyMigration: migrationPreview(false),
      })
      .mockResolvedValueOnce({
        ...baseResult,
        commandId: "commit",
        repositoryVersion: 6,
        legacyMigration: migrationPreview(true),
      });
    const client = { execute, cancel: vi.fn(), dispose: vi.fn() } as unknown as StrategyApplicationClient<unknown>;

    const prepared = await previewOrbitLegacyMigration(client, new Date("2026-08-21T18:00:00Z"));
    expect(window.localStorage.getItem(STRATEGY_MIGRATED_KEY)).toBeNull();
    const result = await commitOrbitLegacyMigration(client, prepared);

    expect(result.imported).toBe(true);
    expect(execute.mock.calls[2][0]).toMatchObject({
      operation: "migrate_legacy",
      expectedRepositoryVersion: 5,
      confirmedFingerprint: "fp-1",
      sources: prepared.sources,
    });
    expect(window.localStorage.getItem(STRATEGY_MIGRATED_KEY)).toContain("fp-1");
    expect(writeStrategyEvents({ events: [], activeId: null })).toBe(false);
  });

  it("no marca el store si el commit falla", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({ ...baseResult, commandId: "list" })
      .mockResolvedValueOnce({ ...baseResult, commandId: "preview", repositoryVersion: 5, legacyMigration: migrationPreview(false) })
      .mockRejectedValueOnce(new Error("backend caído"));
    const client = { execute, cancel: vi.fn(), dispose: vi.fn() } as unknown as StrategyApplicationClient<unknown>;
    const prepared = await previewOrbitLegacyMigration(client, new Date("2026-08-21T18:00:00Z"));
    await expect(commitOrbitLegacyMigration(client, prepared)).rejects.toThrow("backend caído");
    expect(window.localStorage.getItem(STRATEGY_MIGRATED_KEY)).toBeNull();
  });

  it("rollback usa la versión viva, retira el flag y conserva el resultado archivado", async () => {
    window.localStorage.setItem(STRATEGY_MIGRATED_KEY, '{"fingerprint":"fp-1"}');
    const rolledBack = { ...migrationPreview(false), rolledBack: true };
    const execute = vi
      .fn()
      .mockResolvedValueOnce({ ...baseResult, repositoryVersion: 9 })
      .mockResolvedValueOnce({ ...baseResult, repositoryVersion: 10, legacyMigration: rolledBack });
    const client = { execute, cancel: vi.fn(), dispose: vi.fn() } as unknown as StrategyApplicationClient<unknown>;
    await expect(rollbackOrbitLegacyMigration(client, "journal-1", new Date("2026-08-21T19:00:00Z"))).resolves.toMatchObject({ rolledBack: true });
    expect(execute.mock.calls[1][0]).toMatchObject({ operation: "rollback_legacy_migration", expectedRepositoryVersion: 9, journalId: "journal-1" });
    expect(window.localStorage.getItem(STRATEGY_MIGRATED_KEY)).toBeNull();
  });
});

function migrationPreview(imported: boolean): NonNullable<StrategyApplicationResultV1<unknown>["legacyMigration"]> {
  return {
    fingerprint: "fp-1",
    journalId: "journal-1",
    document: {
      contractVersion: "strategy.v2",
      schemaVersion: "2.0.0",
      generatedAt: "2026-08-21T18:00:00Z",
      events: [],
    },
    quarantine: [],
    warnings: [],
    imported,
    alreadyImported: false,
    rolledBack: false,
  };
}
