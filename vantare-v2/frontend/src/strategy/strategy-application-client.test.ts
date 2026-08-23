import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createStrategyApplicationClient,
  StrategyApplicationError,
  type StrategyApplicationCommandV1,
  type StrategyApplicationEventTransport,
} from "./strategy-application-client";
import orbitGolden from "../hub/strategy-orbit/testdata/orbit-go-golden.json";

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

  it("valida WeatherScenario v1 y el resultado robusto de Orbit", async () => {
    const client = createStrategyApplicationClient<Payload>(transport);
    const command: StrategyApplicationCommandV1<Payload> = {
      protocolVersion: "strategy.application.v1",
      commandId: "orbit-weather-1",
      operation: "calculate_orbit",
      expectedRepositoryVersion: 0,
      input: { event: { durationMinutes: 10, tankLiters: 60, pitLossSeconds: 20 }, drivers: [{ id: "d1", name: "D", dry: { paceSeconds: 60, fuelLitersPerLap: 1 }, wet: { paceSeconds: 66, fuelLitersPerLap: 1 }, eco: { paceSeconds: 61, fuelLitersPerLap: 0.9 } }], variants: [{ id: "s1", mode: "dry", order: ["d1"], overrides: {} }], activeVariantId: "s1" },
    };
    const pending = client.execute(command);
    emit(transport, "strategy:application:result", {
      protocolVersion: "strategy.application.v1", commandId: command.commandId, repositoryVersion: 0,
      recoveredFromBackup: false, closed: false,
      orbitCalculation: {
        ...orbitGolden,
        weather: {
          plans: [{ scenarioId: "rain", weight: 1, totalSeconds: 650, stops: 1, stints: [{ index: 0, laps: 5 }, { index: 1, laps: 5 }], timeline: [{ lap: 1, rainChance: 0, bucket: "dry" }, { lap: 6, rainChance: 70, bucket: "wet" }] }],
          robust: { method: "minimax_regret", maxRegretSeconds: 3, weightedExpectedLossSeconds: 1.5, stints: [{ index: 0, laps: 5 }, { index: 1, laps: 5 }] },
        },
      },
    });
    await expect(pending).resolves.toMatchObject({ orbitCalculation: { weather: { robust: { maxRegretSeconds: 3, weightedExpectedLossSeconds: 1.5 }, plans: [{ timeline: [{ bucket: "dry" }, { bucket: "wet" }] }] } } });
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

  it("parses derived planning inputs together with a non-destructive override", async () => {
    const client = createStrategyApplicationClient<Payload>(transport);
    const command: StrategyApplicationCommandV1<Payload> = {
      protocolVersion: "strategy.application.v1", commandId: "planning-inputs-1",
      operation: "get_event_planning_inputs", expectedRepositoryVersion: 4,
      eventId: "event-1", generatedAt: "2026-08-22T12:00:00Z",
    };
    const pending = client.execute(command);
    const emptyConfidence = { sampleSize: 0, computationVersion: "producer.v1" };
    const missing = { presence: "missing", provenance: { kind: "derived" }, confidence: emptyConfidence, reason: "missing" };
    emit(transport, "strategy:application:result", {
      protocolVersion: "strategy.application.v1", commandId: command.commandId, repositoryVersion: 4,
      planningInputStatus: "available",
      planningInputs: {
        projection: {
          contractVersion: "strategyinputprojection.v2", generatedAt: command.generatedAt,
          computationVersion: "producer.v1", sourceSessions: ["race-1"], combinationId: "lmu:imola",
          fuelConsumption: { presence: "valid", provenance: { kind: "derived", sourceId: "aggregate:lmu:imola" }, confidence: { sampleSize: 20, rangeLower: 2.6, rangeUpper: 2.9, computationVersion: "producer.v1" }, meanPerLap: 2.75, rangeLower: 2.6, rangeUpper: 2.9 },
          virtualEnergyConsumption: { ...missing, meanPerLap: 0, rangeLower: 0, rangeUpper: 0 },
          combinedStintPaceCurve: { ...missing, identifiability: "combined_only", points: [] },
          tyreDegradation: missing, pit: missing, savingCost: missing,
        },
        overrides: {
          fuel_per_lap_liters: { value: 3.5, presence: "valid", provenance: { kind: "manual", sourceId: "orbit:event-1:fuel" }, confidence: { sampleSize: 1, computationVersion: "orbit-input.v1" } },
        },
      },
      recoveredFromBackup: false, closed: false,
    });

    await expect(pending).resolves.toMatchObject({
      planningInputStatus: "available",
      planningInputs: {
        projection: { fuelConsumption: { meanPerLap: 2.75, confidence: { sampleSize: 20 } } },
        overrides: { fuel_per_lap_liters: { value: 3.5, provenance: { kind: "manual" } } },
      },
    });
  });

  it("parses neutral validated examples with total and per-stint errors", async () => {
    const client = createStrategyApplicationClient<Payload>(transport);
    const command: StrategyApplicationCommandV1<Payload> = {
      protocolVersion: "strategy.application.v1", commandId: "validated-examples-1",
      operation: "get_validated_examples", expectedRepositoryVersion: 4, eventId: "event-1",
    };
    const pending = client.execute(command);
    emit(transport, "strategy:application:result", {
      protocolVersion: "strategy.application.v1", commandId: command.commandId, repositoryVersion: 4,
      validatedExamples: {
        status: "available", combinationId: "lmu:imola",
        races: [{
          raceId: "race-1", occurredAt: "2026-08-20T18:00:00Z",
          predictedTotalSeconds: 416, observedTotalSeconds: 420,
          absoluteErrorSeconds: 4, absoluteErrorRatio: 4 / 420,
          stints: [{ stintNumber: 1, laps: 4, predictedSeconds: 416, observedSeconds: 420, absoluteErrorSeconds: 4, absoluteErrorRatio: 4 / 420 }],
          pitLaps: [],
        }],
        aggregate: {
          raceCount: 1,
          totalErrorRatio: { count: 1, mean: 4 / 420, lower: 4 / 420, upper: 4 / 420 },
          stintErrorRatio: { count: 1, mean: 4 / 420, lower: 4 / 420, upper: 4 / 420 },
        },
      },
      recoveredFromBackup: false, closed: false,
    });

    await expect(pending).resolves.toMatchObject({
      validatedExamples: {
        status: "available",
        races: [{ raceId: "race-1", stints: [{ laps: 4 }] }],
        aggregate: { raceCount: 1, totalErrorRatio: { count: 1 } },
      },
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

  it("allows a long-running command to override the default timeout", async () => {
    const client = createStrategyApplicationClient<Payload>(transport, 100);
    const pending = client.execute(openCommand(), { timeoutMs: 1_000 });
    await vi.advanceTimersByTimeAsync(101);
    emit(transport, "strategy:application:result", {
      protocolVersion: "strategy.application.v1",
      commandId: "open-1",
      repositoryVersion: 3,
      draft: draft(),
      savedDraft: draft(),
      recoveredFromBackup: false,
      closed: false,
    });
    await expect(pending).resolves.toMatchObject({ repositoryVersion: 3 });
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

describe("cold start failures", () => {
  it("acepta una lista de omitidas ausente y la normaliza a vacia", async () => {
    const transport = createTransport();
    const client = createStrategyApplicationClient<Payload>(transport);
    const command: StrategyApplicationCommandV1<Payload> = {
      protocolVersion: "strategy.application.v1",
      commandId: "cold-status-null",
      operation: "get_cold_start_status",
      expectedRepositoryVersion: 0,
    };
    const pending = client.execute(command);
    emit(transport, "strategy:application:result", {
      protocolVersion: "strategy.application.v1",
      commandId: "cold-status-null",
      repositoryVersion: 1,
      recoveredFromBackup: false,
      closed: false,
      imported: false,
      coldStartStatus: {
        shouldShow: true,
        checking: false,
        found: 337,
        imported: 224,
        skipped: 0,
        failures: null,
        decision: "pending",
      },
    });
    const result = await pending;
    expect(result.coldStartStatus?.found).toBe(337);
    expect(result.coldStartStatus?.failures).toEqual([]);
  });
});
