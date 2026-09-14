import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createStrategyApplicationClient,
  StrategyApplicationError,
  type StrategyApplicationCommandV1,
  type StrategyApplicationEventTransport,
} from "./strategy-application-client";
import orbitGolden from "../hub/strategy-orbit/testdata/orbit-go-golden.json";
import projectionGolden from "../../../internal/telemetryanalysis/strategyprojection/testdata/strategyinputprojection_v2_new.json";
import { defaultTyreCondition } from "./strategy-tyre";
import { canonicalizeAndHashStrategyJSONV1, type RevisionRefV1 } from "./strategy-contract-v1";

describe("event rules document transport", () => {
  it.each([
    ["2.0.0", undefined, true],
    ["2.1.0", { minPitStops: 2, requiredWindows: [{ fromLap: 10, toLap: 20 }] }, true],
    ["2.0.0", { minPitStops: 2 }, false],
    ["2.2.0", undefined, false],
    ["2.1.0", null, false],
    ["2.1.0", { minPitStops: -1 }, false],
    ["2.1.0", { minPitStops: 3, maxPitStops: 1 }, false],
    ["2.1.0", { requiredWindows: [{ fromLap: 0, toLap: 2 }] }, false],
    ["2.1.0", { driverLimits: { d1: { maxTotalTimeSeconds: 100 } }, allowedCompoundsByClimate: { dry: ["soft"] } }, true],
    ["2.1.0", { driverLimits: { d1: { maxLaps: 1.5 } } }, false],
    ["2.1.0", { allowedCompoundsByClimate: { dry: [] } }, false],
    ["2.1.0", { mandatoryCompounds: ["soft", "soft"] }, false],
  ])("validates version %s and rules %j", async (schemaVersion, rules, valid) => {
    const transport = createTransport();
    const client = createStrategyApplicationClient<Payload>(transport);
    const evidence = { provenance: { kind: "manual", sourceId: "test" }, confidence: { level: "high", basis: "test" } };
    const sourced = (value: unknown) => ({ value, evidence });
    const event = {
      id: "event-1", name: sourced("Race"), source: sourced("custom"), track: sourced("Fuji"), cls: sourced("Hypercar"),
      durationMin: sourced(60), startAt: sourced(null), tankLiters: sourced(100), pitLossSeconds: sourced(50),
      fillMode: sourced("manual"), drivers: [], strategies: [], availability: {}, tyreInventory: { sets: [] },
      ...(rules === undefined ? {} : { rules: sourced(rules) }),
    };
    const pending = client.execute({ protocolVersion: "strategy.application.v1", commandId: "rules", operation: "list_events", expectedRepositoryVersion: 1 });
    emit(transport, "strategy:application:result", {
      protocolVersion: "strategy.application.v1", commandId: "rules", repositoryVersion: 1, recoveredFromBackup: false, closed: false,
      strategyDocument: { contractVersion: "strategy.v2", schemaVersion, generatedAt: "2026-09-09T12:00:00Z", events: [event] },
    });
    try {
      if (valid) await expect(pending).resolves.toMatchObject({ strategyDocument: { schemaVersion, events: [event] } });
      else await expect(pending).rejects.toThrow(/Strategy/);
    } finally { client.dispose(); }
  });
});

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

async function revisionDocument(
  ref: Omit<RevisionRefV1, "contentHash">,
): Promise<Record<string, unknown> & RevisionRefV1> {
  const revision = {
    contractVersion: "strategy.v1",
    hashAlgorithm: "sha256:strategy-c14n-v1",
    revisionId: ref.revisionId,
    sourceDraftId: "draft-1",
    planId: ref.planId,
    variantId: ref.variantId,
    name: "Race plan",
    mode: "manual",
    capabilities: ["manual_inputs"],
    provenance: { kind: "manual", sourceId: "user" },
    confidence: { level: "high", basis: "manual" },
    createdAt: "2026-08-02T00:00:01Z",
    payload: { laps: 10 },
  };
  const { sha256 } = await canonicalizeAndHashStrategyJSONV1(JSON.stringify(revision));
  return { ...revision, contentHash: sha256 };
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

  it("preserves a lap horizon without inventing a timed horizon", async () => {
    const client = createStrategyApplicationClient<Payload>(transport);
    const command: StrategyApplicationCommandV1<Payload> = {
      protocolVersion: "strategy.application.v1",
      commandId: "orbit-laps",
      operation: "calculate_orbit",
      expectedRepositoryVersion: 0,
      input: {
        event: {
          raceKind: "laps", targetLaps: 12, durationMinutes: 0, tankLiters: 60,
          initialFuelLiters: 0,
          fuelReserveLiters: 0,
          virtualEnergy: { applicability: "applicable", capacityPercent: 80, initialPercent: 0, reservePercent: 0 },
          pitLossSeconds: 20,
        },
        drivers: [{ id: "d1", name: "D", dry: { paceSeconds: 60, fuelLitersPerLap: 1 }, wet: { paceSeconds: 66, fuelLitersPerLap: 1 }, eco: { paceSeconds: 61, fuelLitersPerLap: 0.9 } }],
        variants: [{ id: "s1", mode: "dry", driverOrderMode: "free", order: ["d1"], overrides: {} }],
        activeVariantId: "s1",
      },
    };

    const pending = client.execute(command);
    expect(transport.emitted).toEqual([{ name: "strategy:application:command", payload: command }]);
    expect(command.input.event).toEqual({
      raceKind: "laps", targetLaps: 12, durationMinutes: 0, tankLiters: 60,
      initialFuelLiters: 0,
      fuelReserveLiters: 0,
      virtualEnergy: { applicability: "applicable", capacityPercent: 80, initialPercent: 0, reservePercent: 0 },
      pitLossSeconds: 20,
    });
    expect(command.input.variants[0].driverOrderMode).toBe("free");
    client.cancel(command.commandId);
    await expect(pending).rejects.toThrow(/cancelled/i);
  });

  it.each([
    ["absent", true],
    ["not_proven", true],
    ["proven", false],
    [null, false],
    [7, false],
  ] as const)("validates Orbit optimality when present: %s", async (optimality, valid) => {
    const client = createStrategyApplicationClient<Payload>(transport);
    const command: StrategyApplicationCommandV1<Payload> = {
      protocolVersion: "strategy.application.v1", commandId: `orbit-optimality-${String(optimality)}`,
      operation: "calculate_orbit", expectedRepositoryVersion: 0,
      input: {
        event: { durationMinutes: 10, tankLiters: 60, pitLossSeconds: 20 },
        drivers: [{ id: "d1", name: "D", dry: { paceSeconds: 60, fuelLitersPerLap: 1 }, wet: { paceSeconds: 66, fuelLitersPerLap: 1 }, eco: { paceSeconds: 61, fuelLitersPerLap: 0.9 } }],
        variants: [{ id: "s1", mode: "dry", order: ["d1"], overrides: {} }], activeVariantId: "s1",
      },
    };
    const plan: Record<string, unknown> = { ...orbitGolden.plans.s1 };
    if (optimality === "absent") delete plan.optimality;
    else plan.optimality = optimality;

    const pending = client.execute(command);
    emit(transport, "strategy:application:result", {
      protocolVersion: "strategy.application.v1", commandId: command.commandId, repositoryVersion: 0,
      recoveredFromBackup: false, closed: false,
      orbitCalculation: { ...orbitGolden, plans: { s1: plan } },
    });

    if (!valid) {
      await expect(pending).rejects.toThrow("orbitCalculation.plans.s1.optimality");
      return;
    }
    await expect(pending).resolves.toMatchObject({
      orbitCalculation: { plans: { s1: optimality === "not_proven" ? { optimality } : {} } },
    });
  });

  it("transports the canonical physical inventory and compound pace unchanged", async () => {
    const client = createStrategyApplicationClient<Payload>(transport);
    const corners = ["FL", "FR", "RL", "RR"] as const;
    const tyres = corners.map((corner) => ({
      id: `H-${corner}`,
      compound: "hard" as const,
      origin: "event_allocation" as const,
      condition: defaultTyreCondition("event_allocation"),
      state: "free" as const,
      stints: 0,
    }));
    const command: StrategyApplicationCommandV1<Payload> = {
      protocolVersion: "strategy.application.v1", commandId: "orbit-tyres", operation: "calculate_orbit", expectedRepositoryVersion: 0,
      input: {
        event: {
          durationMinutes: 10, tankLiters: 60, pitLossSeconds: 20,
          tyreInventory: { maximum: 4, tyres },
          compoundPace: [{
            compound: "hard", presence: "valid",
            provenance: { kind: "reference", sourceId: "catalog:test" },
            confidence: { sampleSize: 1, computationVersion: "test.v1" },
            paceDeltaSeconds: 0, degradationPerLapSeconds: 0,
          }],
        },
        drivers: [{ id: "d1", name: "D", dry: { paceSeconds: 60, fuelLitersPerLap: 1 }, wet: { paceSeconds: 66, fuelLitersPerLap: 1 }, eco: { paceSeconds: 61, fuelLitersPerLap: 0.9 } }],
        variants: [{ id: "s1", mode: "dry", order: ["d1"], overrides: {} }], activeVariantId: "s1",
      },
    };

    const pending = client.execute(command);
    expect(transport.emitted[0]).toEqual({ name: "strategy:application:command", payload: command });
    client.cancel(command.commandId);
    await expect(pending).rejects.toThrow(/cancelled/i);
  });

  it("preserves complete physical tyre decisions including false", async () => {
    const client = createStrategyApplicationClient<Payload>(transport);
    const command: StrategyApplicationCommandV1<Payload> = {
      protocolVersion: "strategy.application.v1", commandId: "orbit-tyre-result", operation: "calculate_orbit", expectedRepositoryVersion: 0,
      input: { event: { durationMinutes: 10, tankLiters: 60, pitLossSeconds: 20 }, drivers: [{ id: "d1", name: "D", dry: { paceSeconds: 60, fuelLitersPerLap: 1 }, wet: { paceSeconds: 66, fuelLitersPerLap: 1 }, eco: { paceSeconds: 61, fuelLitersPerLap: 0.9 } }], variants: [{ id: "s1", mode: "dry", order: ["d1"], overrides: {} }], activeVariantId: "s1" },
    };
    const fitment = { frontLeft: "H-FL", frontRight: "H-FR", rearLeft: "H-RL", rearRight: "H-RR" };
    const pending = client.execute(command);
    emit(transport, "strategy:application:result", {
      protocolVersion: "strategy.application.v1", commandId: command.commandId, repositoryVersion: 0, recoveredFromBackup: false, closed: false,
      orbitCalculation: {
        ...orbitGolden,
        plans: { s1: {
          ...orbitGolden.plans.s1,
          stints: orbitGolden.plans.s1.stints.map((stint) => ({ ...stint, compound: "hard", tyreFitment: fitment })),
          stopDetails: orbitGolden.plans.s1.stopDetails.map((stop) => ({ ...stop, changeTyres: false, compound: "hard", tyreFitment: fitment })),
        } },
      },
    });

    const result = await pending;
    expect(result.orbitCalculation?.plans.s1.stopDetails[0]).toMatchObject({
      changeTyres: false, compound: "hard", tyreFitment: fitment,
    });
  });

  it("transports explicit pit services and formation with the compatible legacy field", async () => {
    const client = createStrategyApplicationClient<Payload>(transport);
    const event = {
      durationMinutes: 10,
      tankLiters: 60,
      pitLossSeconds: 60,
      formationSeconds: 30,
      pitServices: { transitSeconds: 20, refuelRateLPerS: 2, veRatePPerS: 3, tyreSeconds: 8, serviceMode: "parallel" as const },
    };
    const command: StrategyApplicationCommandV1<Payload> = {
      protocolVersion: "strategy.application.v1", commandId: "orbit-services", operation: "calculate_orbit", expectedRepositoryVersion: 0,
      input: { event, drivers: [{ id: "d1", name: "D", dry: { paceSeconds: 60, fuelLitersPerLap: 1 }, wet: { paceSeconds: 66, fuelLitersPerLap: 1 }, eco: { paceSeconds: 61, fuelLitersPerLap: 0.9 } }], variants: [{ id: "s1", mode: "dry", order: ["d1"], overrides: {} }], activeVariantId: "s1" },
    };

    const pending = client.execute(command);
    expect(transport.emitted[0]).toEqual({ name: "strategy:application:command", payload: command });
    client.cancel(command.commandId);
    await expect(pending).rejects.toThrow(/cancelled/i);
  });

  it.each([30, 0])("preserves explicit formationSeconds %s in calculated plans", async (formationSeconds) => {
    const client = createStrategyApplicationClient<Payload>(transport);
    const command: StrategyApplicationCommandV1<Payload> = {
      protocolVersion: "strategy.application.v1", commandId: `orbit-formation-${formationSeconds}`, operation: "calculate_orbit", expectedRepositoryVersion: 0,
      input: { event: { durationMinutes: 10, tankLiters: 60, pitLossSeconds: 20 }, drivers: [{ id: "d1", name: "D", dry: { paceSeconds: 60, fuelLitersPerLap: 1 }, wet: { paceSeconds: 66, fuelLitersPerLap: 1 }, eco: { paceSeconds: 61, fuelLitersPerLap: 0.9 } }], variants: [{ id: "s1", mode: "dry", order: ["d1"], overrides: {} }], activeVariantId: "s1" },
    };
    const pending = client.execute(command);
    emit(transport, "strategy:application:result", {
      protocolVersion: "strategy.application.v1", commandId: command.commandId, repositoryVersion: 0, recoveredFromBackup: false, closed: false,
      orbitCalculation: { ...orbitGolden, plans: { s1: { ...orbitGolden.plans.s1, formationSeconds } } },
    });

    await expect(pending).resolves.toMatchObject({ orbitCalculation: { plans: { s1: { formationSeconds } } } });
  });

  it.each([null, "30", Number.POSITIVE_INFINITY])("rejects invalid formationSeconds %s", async (formationSeconds) => {
    const client = createStrategyApplicationClient<Payload>(transport);
    const command: StrategyApplicationCommandV1<Payload> = {
      protocolVersion: "strategy.application.v1", commandId: `orbit-invalid-formation-${String(formationSeconds)}`, operation: "calculate_orbit", expectedRepositoryVersion: 0,
      input: { event: { durationMinutes: 10, tankLiters: 60, pitLossSeconds: 20 }, drivers: [{ id: "d1", name: "D", dry: { paceSeconds: 60, fuelLitersPerLap: 1 }, wet: { paceSeconds: 66, fuelLitersPerLap: 1 }, eco: { paceSeconds: 61, fuelLitersPerLap: 0.9 } }], variants: [{ id: "s1", mode: "dry", order: ["d1"], overrides: {} }], activeVariantId: "s1" },
    };
    const pending = client.execute(command);
    emit(transport, "strategy:application:result", {
      protocolVersion: "strategy.application.v1", commandId: command.commandId, repositoryVersion: 0, recoveredFromBackup: false, closed: false,
      orbitCalculation: { ...orbitGolden, plans: { s1: { ...orbitGolden.plans.s1, formationSeconds } } },
    });

    await expect(pending).rejects.toThrow(/formationSeconds/);
  });

  it.each([
    ["missing fitment", { changeTyres: false, compound: "hard" }],
    ["invalid compound", { changeTyres: false, compound: "dry", tyreFitment: { frontLeft: "H-FL", frontRight: "H-FR", rearLeft: "H-RL", rearRight: "H-RR" } }],
    ["missing change", { compound: "hard", tyreFitment: { frontLeft: "H-FL", frontRight: "H-FR", rearLeft: "H-RL", rearRight: "H-RR" } }],
  ])("rejects an incomplete physical stop: %s", async (_name, physical) => {
    const client = createStrategyApplicationClient<Payload>(transport);
    const command: StrategyApplicationCommandV1<Payload> = {
      protocolVersion: "strategy.application.v1", commandId: `orbit-invalid-${_name.replace(" ", "-")}`, operation: "calculate_orbit", expectedRepositoryVersion: 0,
      input: { event: { durationMinutes: 10, tankLiters: 60, pitLossSeconds: 20 }, drivers: [{ id: "d1", name: "D", dry: { paceSeconds: 60, fuelLitersPerLap: 1 }, wet: { paceSeconds: 66, fuelLitersPerLap: 1 }, eco: { paceSeconds: 61, fuelLitersPerLap: 0.9 } }], variants: [{ id: "s1", mode: "dry", order: ["d1"], overrides: {} }], activeVariantId: "s1" },
    };
    const pending = client.execute(command);
    emit(transport, "strategy:application:result", {
      protocolVersion: "strategy.application.v1", commandId: command.commandId, repositoryVersion: 0, recoveredFromBackup: false, closed: false,
      orbitCalculation: { ...orbitGolden, plans: { s1: { ...orbitGolden.plans.s1, stopDetails: [{ ...orbitGolden.plans.s1.stopDetails[0], ...physical }] } } },
    });
    await expect(pending).rejects.toThrow(/Strategy.*stopDetails/);
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

  it("opens the exact requested revision without a draft selector", async () => {
    const client = createStrategyApplicationClient<Payload>(transport);
    const revision = await revisionDocument({ planId: "plan-1", variantId: "variant-1", revisionId: "revision-a" });
    const command: StrategyApplicationCommandV1<Payload> = {
      protocolVersion: "strategy.application.v1",
      commandId: "open-revision-a",
      operation: "open",
      expectedRepositoryVersion: 3,
      revision: {
        planId: revision.planId,
        variantId: revision.variantId,
        revisionId: revision.revisionId,
        contentHash: revision.contentHash,
      },
    };

    const pending = client.execute(command);
    expect(transport.emitted).toEqual([{ name: "strategy:application:command", payload: command }]);
    expect(command).not.toHaveProperty("draftId");
    emit(transport, "strategy:application:result", {
      protocolVersion: "strategy.application.v1",
      commandId: command.commandId,
      repositoryVersion: 3,
      revision,
      recoveredFromBackup: false,
      closed: false,
    });

    await expect(pending).resolves.toMatchObject({ revision: { revisionId: "revision-a" } });
  });

  it("rejects a valid revision different from the requested reference", async () => {
    const client = createStrategyApplicationClient<Payload>(transport);
    const requested = await revisionDocument({ planId: "plan-1", variantId: "variant-1", revisionId: "revision-a" });
    const returned = await revisionDocument({ planId: "plan-1", variantId: "variant-1", revisionId: "revision-b" });
    const pending = client.execute({
      protocolVersion: "strategy.application.v1",
      commandId: "open-revision-mismatch",
      operation: "open",
      expectedRepositoryVersion: 3,
      revision: {
        planId: requested.planId,
        variantId: requested.variantId,
        revisionId: requested.revisionId,
        contentHash: requested.contentHash,
      },
    });
    emit(transport, "strategy:application:result", {
      protocolVersion: "strategy.application.v1",
      commandId: "open-revision-mismatch",
      repositoryVersion: 3,
      revision: returned,
      recoveredFromBackup: false,
      closed: false,
    });

    await expect(pending).rejects.toThrow(/different revision/i);
  });

  it("rejects a revision open result without the requested revision", async () => {
    const client = createStrategyApplicationClient<Payload>(transport);
    const requested = await revisionDocument({ planId: "plan-1", variantId: "variant-1", revisionId: "revision-a" });
    const pending = client.execute({
      protocolVersion: "strategy.application.v1",
      commandId: "open-revision-missing",
      operation: "open",
      expectedRepositoryVersion: 3,
      revision: {
        planId: requested.planId,
        variantId: requested.variantId,
        revisionId: requested.revisionId,
        contentHash: requested.contentHash,
      },
    });
    emit(transport, "strategy:application:result", {
      protocolVersion: "strategy.application.v1",
      commandId: "open-revision-missing",
      repositoryVersion: 3,
      recoveredFromBackup: false,
      closed: false,
    });

    await expect(pending).rejects.toThrow(/different revision/i);
  });

  it.each([["fixed_distance", 10, true], ["timed", 10, false], [undefined, 10, false], ["fixed_distance", 0, false], ["fixed_distance", 10.5, false]] as const)("valida el alcance de WeatherScenario: %s / %s", async (comparisonBasis, comparisonLaps, valid) => {
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
          comparisonBasis, comparisonLaps,
          plans: [{ scenarioId: "rain", weight: 1, totalSeconds: 650, stops: 1, stints: [{ index: 0, laps: 5 }, { index: 1, laps: 5 }], timeline: [{ lap: 1, rainChance: 0, bucket: "dry" }, { lap: 6, rainChance: 70, bucket: "wet" }] }],
          robust: { method: "minimax_regret", maxRegretSeconds: 3, weightedExpectedLossSeconds: 1.5, stints: [{ index: 0, laps: 5 }, { index: 1, laps: 5 }] },
        },
      },
    });
    if (!valid) { await expect(pending).rejects.toThrow("Invalid Strategy orbitCalculation.weather.comparison"); return; }
    await expect(pending).resolves.toMatchObject({ orbitCalculation: { weather: { comparisonBasis: "fixed_distance", comparisonLaps: 10, robust: { maxRegretSeconds: 3, weightedExpectedLossSeconds: 1.5 }, plans: [{ timeline: [{ bucket: "dry" }, { bucket: "wet" }] }] } } });
    await expect(pending).resolves.toMatchObject({ orbitCalculation: { plans: { s1: { optimality: "not_proven" } } } });
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

  it.each(["legacy", "complete", "partial", "duplicate", "foreign", "bad-digest", "empty", "null"])("validates projection revision references: %s", async (mode) => {
    const client = createStrategyApplicationClient<Payload>(transport);
    const refs = projectionGolden.sourceSessions.map((sessionId) => ({ sessionId, baseDigest: "a".repeat(64), revisionId: "b".repeat(64), snapshotId: "c".repeat(64) }));
    let sourceRevisions: unknown = refs;
    if (mode === "legacy") sourceRevisions = undefined;
    if (mode === "partial") sourceRevisions = refs.slice(1);
    if (mode === "duplicate") sourceRevisions = [refs[0], refs[0]];
    if (mode === "foreign") refs[0].sessionId = "foreign";
    if (mode === "bad-digest") refs[0].revisionId = "B".repeat(64);
    if (mode === "empty") sourceRevisions = [];
    if (mode === "null") sourceRevisions = null;
    const command: StrategyApplicationCommandV1<Payload> = { protocolVersion: "strategy.application.v1", commandId: "revision-test", operation: "get_event_planning_inputs", expectedRepositoryVersion: 4, eventId: "event-1", generatedAt: "2026-09-08T12:00:00Z" };
    const pending = client.execute(command);
    emit(transport, "strategy:application:result", { protocolVersion: "strategy.application.v1", commandId: command.commandId, repositoryVersion: 4, recoveredFromBackup: false, closed: false, planningInputStatus: "available", planningInputs: { projection: { ...projectionGolden, sourceRevisions }, overrides: {} } });
    if (mode === "legacy" || mode === "complete") {
      await expect(pending).resolves.toMatchObject({ planningInputs: { projection: { sourceRevisions } } });
    } else {
      await expect(pending).rejects.toThrow("sourceRevisions");
    }
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
          fuelConsumption: { presence: "valid", provenance: { kind: "derived", sourceId: "aggregate:lmu:imola" }, confidence: { sampleSize: 20, rangeLower: 2.6, rangeUpper: 2.9, computationVersion: "producer.v1" }, meanPerLap: 2.75, rangeLower: 2.6, rangeUpper: 2.9, byClimateBucket: { dry: 2.75 } },
          virtualEnergyConsumption: { ...missing, meanPerLap: 0, rangeLower: 0, rangeUpper: 0, byClimateBucket: { wet: 1.4 } },
          representativePaceByClimateBucket: {
            dry: { presence: "valid", provenance: { kind: "derived", sourceId: "aggregate:lmu:imola" }, confidence: { sampleSize: 4, rangeLower: 101, rangeUpper: 103, computationVersion: "producer.v1" }, medianLapSeconds: 102 },
          },
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
        projection: {
          fuelConsumption: { meanPerLap: 2.75, byClimateBucket: { dry: 2.75 }, confidence: { sampleSize: 20 } },
          virtualEnergyConsumption: { byClimateBucket: { wet: 1.4 } },
          representativePaceByClimateBucket: { dry: { medianLapSeconds: 102, confidence: { sampleSize: 4 } } },
        },
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

  it("exposes the typed backend calculation deadline", async () => {
    const client = createStrategyApplicationClient<Payload>(transport);
    const pending = client.execute(openCommand());
    emit(transport, "strategy:application:error", {
      commandId: "open-1",
      code: "calculation_timeout",
      field: "input.variants.0",
      message: "The Strategy calculation reached its backend deadline. Adjust the inputs or retry.",
    });

    await expect(pending).rejects.toMatchObject({
      name: "StrategyApplicationError",
      code: "calculation_timeout",
      field: "input.variants.0",
    } satisfies Partial<StrategyApplicationError>);
  });

  it("exposes backend calculation cancellation without calling it a deadline", async () => {
    const client = createStrategyApplicationClient<Payload>(transport);
    const pending = client.execute(openCommand());
    emit(transport, "strategy:application:error", {
      commandId: "open-1",
      code: "calculation_cancelled",
      field: "input.variants.0",
      message: "The Strategy calculation was cancelled.",
    });

    await expect(pending).rejects.toMatchObject({
      name: "StrategyApplicationError",
      code: "calculation_cancelled",
      field: "input.variants.0",
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
        reason: "state_unavailable",
        recovered: true,
      },
    });
    const result = await pending;
    expect(result.coldStartStatus?.reason).toBe("state_unavailable");
    expect(result.coldStartStatus?.recovered).toBe(true);
    expect(result.coldStartStatus?.found).toBe(337);
    expect(result.coldStartStatus?.failures).toEqual([]);
  });
});


describe("event Analysis revision selection", () => {
  it.each(["valid", "legacy", "excluded", "foreign", "partial", "digest", "null", "mismatch", "missing_projection_refs"])("validates %s selection before exposing the event", async (mode) => {
    const transport = createTransport();
    const client = createStrategyApplicationClient<Payload>(transport);
    const evidence = { provenance: { kind: "manual", sourceId: "test" }, confidence: { level: "high", basis: "test" } };
    const sourced = (value: unknown) => ({ value, evidence });
    const ref = { sessionId: "race-1", baseDigest: "a".repeat(64), revisionId: "b".repeat(64), snapshotId: "c".repeat(64) };
    const sessions: Array<Record<string, unknown>> = [{ sessionId: "race-1", included: true, revision: { ...ref } }];
    if (mode === "legacy") delete sessions[0].revision;
    if (mode === "excluded") sessions[0].included = false;
    if (mode === "foreign") sessions[0].revision = { ...ref, sessionId: "other" };
    if (mode === "partial") sessions.push({ sessionId: "other", included: true });
    if (mode === "digest") sessions[0].revision = { ...ref, revisionId: "latest" };
    if (mode === "null") sessions[0].revision = null;
    const event = {
      id: "event-1", name: sourced("Race"), source: sourced("custom"), track: sourced("Fuji"), cls: sourced("Hypercar"),
      durationMin: sourced(60), startAt: sourced(null), tankLiters: sourced(100), pitLossSeconds: sourced(50),
      fillMode: sourced("manual"), drivers: [], strategies: [], availability: {}, tyreInventory: { sets: [] },
      combination: { combinationId: projectionGolden.combinationId, sessions },
      ...(["valid", "mismatch", "missing_projection_refs"].includes(mode) ? { planningInputs: { overrides: {}, projection: { ...projectionGolden, sourceSessions: ["race-1"], sourceRevisions: mode === "missing_projection_refs" ? undefined : [{ ...ref, revisionId: mode === "mismatch" ? "d".repeat(64) : ref.revisionId }] } } } : {}),
    };
    const pending = client.execute({ protocolVersion: "strategy.application.v1", commandId: "selection", operation: "list_events", expectedRepositoryVersion: 1 });
    emit(transport, "strategy:application:result", { protocolVersion: "strategy.application.v1", commandId: "selection", repositoryVersion: 1, recoveredFromBackup: false, closed: false, events: [event] });
    try {
      if (["valid", "legacy", "excluded"].includes(mode)) await expect(pending).resolves.toMatchObject({ events: [{ combination: event.combination }] });
      else await expect(pending).rejects.toThrow(/revision/i);
    } finally { client.dispose(); }
  });
});
