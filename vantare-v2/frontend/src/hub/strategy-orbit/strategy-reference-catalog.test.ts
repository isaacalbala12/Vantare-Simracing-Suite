import { describe, expect, it } from "vitest";
import type { StrategyApplicationClient, StrategyApplicationCommandV1, StrategyApplicationResultV1, StrategyEventV2, StrategyReferenceCatalogResultV1 } from "../../strategy/strategy-application-client";
import { applyReferenceProfile, applyReferenceStrategy } from "./strategy-reference-catalog";
import { strategyEventV2FromRecord } from "./strategy-session-selection";
import type { StrategyEventRecord } from "./strategy-events-store";

const record: StrategyEventRecord = {
  id: "event-1", name: "Spa", source: "custom", track: "Spa", cls: "LMGT3", durationMin: 60, startAt: null,
  drivers: [{ id: "d1", name: "Isaac", ini: "IA", color: "#fff", cls: "LMGT3", dry: [120, 2.5], wet: [130, 2.8], eco: [125, 2.2] }],
  tankL: 100, pitLossSec: 40, strategies: [{ id: "own", name: "Base", note: "", mode: "dry", order: ["d1"], state: "ok", overrides: {}, tyres: {} }],
};

const catalog: StrategyReferenceCatalogResultV1 = {
  source: "candidate",
  catalog: { contractVersion: "strategy.catalog.payload.v1", source: { minimumCohort: 3 }, combinations: [{ combinationId: "spa-lmgt3", referenceProfile: {
    targetContractVersion: "pilotprofile.v1", provenance: { kind: "reference", environment: "production-community" }, sample: { semanticBundles: 3, contributors: 4, sessions: 10 },
    quality: { validSessions: 9, invalidSessions: 1, sampleSessions: 10, validRatio: .9 }, fuel: { medianPerLap: 2.15, rangeLower: 2, rangeUpper: 2.3, sampleLaps: 40 }, pit: { count: 4, typicalDurationSeconds: 20.5 },
  }, strategies: [{ rank: 1, clusterDigest: "bbbbbbbbbbbbbbbb", representative: { stintCount: 2, pitLaps: [20], compounds: ["hard", "soft"] }, provenance: { kind: "reference", environment: "production-community" }, sample: { semanticBundles: 3, contributors: 4, sessions: 10 } }] }] },
};

describe("Strategy reference catalog", () => {
  it("creates own canonical starting points with reference provenance", async () => {
    let saved: StrategyEventV2 | undefined = strategyEventV2FromRecord(record);
    const client: StrategyApplicationClient<unknown> = {
      async execute(command: StrategyApplicationCommandV1<unknown>): Promise<StrategyApplicationResultV1<unknown>> {
        if (command.operation === "edit_event" || command.operation === "create_event") saved = command.event;
        return { protocolVersion: "strategy.application.v1", commandId: command.commandId, repositoryVersion: 1, strategyDocument: { contractVersion: "strategy.v2", schemaVersion: "2.0.0", generatedAt: new Date().toISOString(), events: saved ? [saved] : [] }, recoveredFromBackup: false, closed: false };
      }, cancel: () => false, dispose: () => undefined,
    };
    saved = await applyReferenceProfile(client, 0, saved, record, catalog.catalog.combinations[0]);
    expect(saved.planningInputs?.overrides.fuel_per_lap_liters?.provenance.kind).toBe("reference");
    saved = await applyReferenceStrategy(client, 1, saved, record, catalog.catalog.combinations[0].strategies[0]);
    expect(saved.strategies.at(-1)?.name.evidence.provenance.kind).toBe("reference");
    expect(saved.strategies.at(-1)?.overrides).toMatchObject({ referenceCatalog: { pitLaps: [20] } });
  });
});
