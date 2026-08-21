import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createStrategyApplicationClient,
  StrategyApplicationError,
  type StrategyApplicationCommandV1,
  type StrategyApplicationEventTransport,
} from "./strategy-application-client";

type Payload = { laps: number };

type MockTransport = StrategyApplicationEventTransport & {
  emitted: Array<{ name: string; payload: unknown }>;
  listeners: Map<string, Set<(payload: unknown) => void>>;
};

function createTransport(): MockTransport {
  const listeners = new Map<string, Set<(payload: unknown) => void>>();
  return {
    emitted: [],
    listeners,
    emit(name, payload) {
      this.emitted.push({ name, payload });
    },
    on(name, listener) {
      const bucket = listeners.get(name) ?? new Set();
      bucket.add(listener);
      listeners.set(name, bucket);
      return () => bucket.delete(listener);
    },
  };
}

function emit(transport: MockTransport, name: string, payload: unknown): void {
  for (const listener of transport.listeners.get(name) ?? []) {
    listener({ data: [payload] });
  }
}

function openCommand(): StrategyApplicationCommandV1<Payload> {
  return {
    protocolVersion: "strategy.application.v1",
    commandId: "open-1",
    operation: "open",
    expectedRepositoryVersion: 0,
    draftId: "draft-1",
  };
}

function draft() {
  return {
    contractVersion: "strategy.v1" as const,
    draftId: "draft-1",
    planId: "plan-1",
    variantId: "variant-1",
    name: "Race plan",
    mode: "manual" as const,
    capabilities: ["manual_inputs"] as const,
    provenance: { kind: "manual" as const, sourceId: "user" },
    confidence: { level: "high" as const, basis: "manual" },
    updatedAt: "2026-08-02T00:00:01Z",
    payload: { laps: 10 },
  };
}

describe("createStrategyApplicationClient", () => {
  let transport: MockTransport;

  beforeEach(() => {
    vi.useFakeTimers();
    transport = createTransport();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("correlates and validates a versioned Wails-array result", async () => {
    const client = createStrategyApplicationClient<Payload>(transport);
    const pending = client.execute(openCommand());

    expect(transport.emitted).toEqual([
      { name: "strategy:application:command", payload: openCommand() },
    ]);
    emit(transport, "strategy:application:result", {
      protocolVersion: "strategy.application.v1",
      commandId: "open-1",
      repositoryVersion: 3,
      draft: draft(),
      savedDraft: draft(),
      recoveredFromBackup: false,
      closed: false,
    });

    await expect(pending).resolves.toMatchObject({
      commandId: "open-1",
      repositoryVersion: 3,
      draft: { payload: { laps: 10 } },
    });
    expect(transport.listeners.get("strategy:application:result")?.size ?? 0).toBe(0);
  });

  it("parses the typed Orbit migration preview including quarantine and journal", async () => {
    const client = createStrategyApplicationClient<Payload>(transport);
    const command: StrategyApplicationCommandV1<Payload> = {
      protocolVersion: "strategy.application.v1",
      commandId: "migration-preview-1",
      operation: "preview_legacy_migration",
      expectedRepositoryVersion: 0,
      sources: [{ key: "vantare.v03orbit.strategy.events", present: true, raw: "e25vIGpzb24=" }],
      migratedAt: "2026-08-21T18:00:00Z",
    };
    const pending = client.execute(command);
    const document = {
      contractVersion: "strategy.v2",
      schemaVersion: "2.0.0",
      generatedAt: "2026-08-21T18:00:00Z",
      events: [],
      migrationMeta: {
        sourceFingerprint: "fingerprint-1",
        journalId: "journal-1",
        migratedAt: "2026-08-21T18:00:00Z",
        status: "backed_up",
        sources: command.sources,
        quarantine: [{ sourceKey: command.sources[0].key, path: "$", code: "invalid_json", message: "JSON roto", raw: command.sources[0].raw }],
        warnings: ["Se conservará en cuarentena"],
      },
    };
    emit(transport, "strategy:application:result", {
      protocolVersion: "strategy.application.v1",
      commandId: command.commandId,
      repositoryVersion: 1,
      strategyDocument: document,
      legacyMigration: {
        fingerprint: "fingerprint-1",
        journalId: "journal-1",
        document,
        quarantine: document.migrationMeta.quarantine,
        warnings: document.migrationMeta.warnings,
        imported: false,
        alreadyImported: false,
        rolledBack: false,
      },
      recoveredFromBackup: false,
      closed: false,
    });

    await expect(pending).resolves.toMatchObject({
      legacyMigration: {
        fingerprint: "fingerprint-1",
        quarantine: [{ code: "invalid_json", path: "$" }],
      },
    });
  });

  it("parses the classified session catalog exposed to Orbit", async () => {
    const client = createStrategyApplicationClient<Payload>(transport);
    const command: StrategyApplicationCommandV1<Payload> = {
      protocolVersion: "strategy.application.v1",
      commandId: "session-catalog-1",
      operation: "list_session_combinations",
      expectedRepositoryVersion: 0,
    };
    const pending = client.execute(command);

    emit(transport, "strategy:application:result", {
      protocolVersion: "strategy.application.v1",
      commandId: command.commandId,
      repositoryVersion: 4,
      sessionCatalogStatus: "available",
      sessionCombinations: [{
        combinationId: "lmu:imola:mustang-gt3",
        simId: "lmu",
        trackName: "Imola",
        trackLayout: "gp",
        carName: "Ford Mustang GT3",
        carClass: "GT3",
        sessionCount: 1,
        raceCount: 1,
        lastActivity: "2026-08-21T18:00:00Z",
        climateBuckets: [{ bucket: "dry", laps: 54 }],
        sessions: [{
          sessionId: "race-1",
          type: "race",
          status: "identified_usable",
          defaultIncluded: true,
          lastActivity: "2026-08-21T18:00:00Z",
          climateBuckets: [{ bucket: "dry", laps: 54 }],
        }],
      }],
      recoveredFromBackup: false,
      closed: false,
    });

    await expect(pending).resolves.toMatchObject({
      sessionCatalogStatus: "available",
      sessionCombinations: [{ combinationId: "lmu:imola:mustang-gt3", sessions: [{ sessionId: "race-1" }] }],
    });
  });

  it("ignores another command and exposes stable application errors", async () => {
    const client = createStrategyApplicationClient<Payload>(transport);
    const pending = client.execute(openCommand());
    emit(transport, "strategy:application:error", {
      commandId: "another",
      code: "draft_not_found",
      field: "draftId",
      message: "wrong request",
    });
    emit(transport, "strategy:application:error", {
      commandId: "open-1",
      code: "draft_not_found",
      field: "draftId",
      message: "not found",
    });

    await expect(pending).rejects.toMatchObject({
      name: "StrategyApplicationError",
      code: "draft_not_found",
      field: "draftId",
    } satisfies Partial<StrategyApplicationError>);
  });

  it("fails closed on a future result protocol", async () => {
    const client = createStrategyApplicationClient<Payload>(transport);
    const pending = client.execute(openCommand());
    emit(transport, "strategy:application:result", {
      protocolVersion: "strategy.application.v2",
      commandId: "open-1",
      repositoryVersion: 1,
    });
    await expect(pending).rejects.toThrow(/protocol/i);
  });

  it("times out and removes every listener", async () => {
    const client = createStrategyApplicationClient<Payload>(transport, 100);
    const pending = client.execute(openCommand());
    const rejection = expect(pending).rejects.toThrow(/timeout/i);
    await vi.advanceTimersByTimeAsync(101);
    await rejection;
    expect(transport.listeners.get("strategy:application:result")?.size ?? 0).toBe(0);
    expect(transport.listeners.get("strategy:application:error")?.size ?? 0).toBe(0);
  });

  it("cleans up immediately when transport emit throws", async () => {
    transport.emit = () => { throw new Error("transport unavailable"); };
    const client = createStrategyApplicationClient<Payload>(transport);

    await expect(client.execute(openCommand())).rejects.toThrow(/transport unavailable/i);

    expect(transport.listeners.get("strategy:application:result")?.size ?? 0).toBe(0);
    expect(transport.listeners.get("strategy:application:error")?.size ?? 0).toBe(0);
  });

  it("cancels one command and ignores its late result", async () => {
    const client = createStrategyApplicationClient<Payload>(transport);
    const pending = client.execute(openCommand());

    expect(client.cancel("open-1")).toBe(true);
    await expect(pending).rejects.toThrow(/cancel/i);
    emit(transport, "strategy:application:result", {
      protocolVersion: "strategy.application.v1",
      commandId: "open-1",
      repositoryVersion: 3,
      draft: draft(),
      savedDraft: draft(),
      recoveredFromBackup: false,
      closed: false,
    });
    expect(transport.listeners.get("strategy:application:result")?.size ?? 0).toBe(0);
  });

  it("disposes every pending command and rejects future execution", async () => {
    const client = createStrategyApplicationClient<Payload>(transport);
    const pending = client.execute(openCommand());

    client.dispose();

    await expect(pending).rejects.toThrow(/disposed/i);
    await expect(client.execute({ ...openCommand(), commandId: "open-2" })).rejects.toThrow(/disposed/i);
    expect(transport.listeners.get("strategy:application:result")?.size ?? 0).toBe(0);
    expect(transport.listeners.get("strategy:application:error")?.size ?? 0).toBe(0);
  });
});
