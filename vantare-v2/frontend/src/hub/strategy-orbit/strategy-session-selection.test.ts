import projectionGolden from "../../../../internal/telemetryanalysis/strategyprojection/testdata/strategyinputprojection_v2_new.json";
import type { StrategyInputProjectionV2 } from "../../strategy/strategy-application-client";
import { describe, expect, it, vi } from "vitest";
import type {
  StrategyApplicationClient,
  StrategyApplicationCommandV1,
  StrategyApplicationResultV1,
  StrategyEventV2,
} from "../../strategy/strategy-application-client";
import {
  loadStrategySessionCatalog,
  persistStrategySessionSelection,
  selectedCombination,
  selectedSessions,
  usableSessionCombinations,
  strategyEventV2FromRecord,
} from "./strategy-session-selection";
import type { StrategyEventRecord } from "./strategy-events-store";

const combination = {
  combinationId: "lmu:fuji",
  simId: "lmu",
  trackName: "Fuji",
  trackLayout: "Classic",
  carName: "499P",
  carClass: "Hypercar",
  sessionCount: 1,
  raceCount: 1,
  lastActivity: "2026-08-21T12:00:00Z",
  climateBuckets: [{ bucket: "dry" as const, laps: 12 }],
  sessions: [{ sessionId: "race-1", type: "race" as const, status: "identified_usable" as const, defaultIncluded: true, lastActivity: "2026-08-21T12:00:00Z", climateBuckets: [] }],
};

const record: StrategyEventRecord = {
  id: "event-1", name: "Fuji 6h", source: "custom", track: "Fuji", cls: "Hypercar",
  durationMin: 360, startAt: "2026-08-22T12:00:00Z", drivers: [{ id: "d1", name: "Isaac", ini: "IA", color: "#fff", cls: "", dry: [90, 3], wet: [100, 2.8], eco: [92, 2.7] }],
  tankL: 100, pitLossSec: 55, strategies: [{ id: "s1", name: "Base", note: "", mode: "dry", order: ["d1"], state: "ok", overrides: {}, tyres: {} }],
};

describe("Strategy session selection", () => {
  it("offers automatic mode only for combinations with weather-classified laps", () => {
    const view = {
      status: "available" as const,
      repositoryVersion: 0,
      combinations: [combination, { ...combination, combinationId: "lmu:fuji:no-weather", climateBuckets: [] }],
      events: [],
      planningByEvent: {},
      planningStatusByEvent: {},
    };

    expect(usableSessionCombinations(view).map((item) => item.combinationId)).toEqual(["lmu:fuji"]);
    expect(usableSessionCombinations({ ...view, status: "no_authorized_telemetry" })).toEqual([]);
  });

  it("persists a non-destructive exclusion in the canonical event", async () => {
    let saved: StrategyEventV2 | undefined;
    let version = 0;
    const client: StrategyApplicationClient<unknown> = {
      async execute(command: StrategyApplicationCommandV1<unknown>): Promise<StrategyApplicationResultV1<unknown>> {
        if (command.operation === "list_session_combinations") return result(command.commandId, version, { sessionCatalogStatus: "available", sessionCombinations: [combination] });
        if (command.operation === "list_events") return result(command.commandId, version, { events: saved ? [saved] : [] });
        if (command.operation === "create_event" || command.operation === "edit_event") {
          saved = command.event;
          version += 1;
          return result(command.commandId, version, { strategyDocument: { contractVersion: "strategy.v2", schemaVersion: "2.0.0", generatedAt: command.updatedAt, events: [saved] } });
        }
        throw new Error(`unexpected ${command.operation}`);
      },
      cancel: () => false,
      dispose: () => undefined,
    };

    const loaded = await loadStrategySessionCatalog(client);
    const persisted = await persistStrategySessionSelection(client, loaded, record, combination, [{ sessionId: "race-1", included: false }]);
    expect(saved?.combination).toEqual({ combinationId: "lmu:fuji", sessions: [{ sessionId: "race-1", included: false }] });
    expect(selectedCombination(persisted, record.id)?.trackName).toBe("Fuji");
    expect(selectedSessions(persisted, record.id, combination)[0].included).toBe(false);
  });
});

function result<TPayload>(
  commandId: string,
  repositoryVersion: number,
  extra: Partial<StrategyApplicationResultV1<TPayload>>,
): StrategyApplicationResultV1<TPayload> {
  return { protocolVersion: "strategy.application.v1", commandId, repositoryVersion, recoveredFromBackup: false, closed: false, ...extra };
}


it.each(["exclusion", "revision", "same", "failure"])("preserves revisions and handles %s without stale derived inputs", async (mode) => {
  const revision = { sessionId: "race-1", baseDigest: "a".repeat(64), revisionId: "b".repeat(64), snapshotId: "c".repeat(64) };
  const projection = { ...projectionGolden, combinationId: combination.combinationId, sourceSessions: ["race-1"], sourceRevisions: [revision] } as unknown as StrategyInputProjectionV2;
  const planning = { projection, overrides: { fuel_per_lap_liters: { value: 3, presence: "valid" as const, provenance: { kind: "manual" as const, sourceId: "test" }, confidence: { sampleSize: 1, computationVersion: "test" } } } };
  const event = { ...strategyEventV2FromRecord(record), combination: { combinationId: combination.combinationId, sessions: [{ sessionId: "race-1", included: true, revision }] }, planningInputs: planning };
  const view = { status: "available" as const, repositoryVersion: 1, combinations: [combination], events: [event], planningByEvent: { [record.id]: planning }, planningStatusByEvent: { [record.id]: "available" as const } };
  const execute = vi.fn(async (command: StrategyApplicationCommandV1<unknown>) => {
    if (command.operation !== "edit_event") throw new Error("unexpected operation");
    if (mode === "failure") throw new Error("conflict");
    return result(command.commandId, 2, { events: [command.event] });
  });
  const client: StrategyApplicationClient<unknown> = { execute, cancel: () => false, dispose: () => undefined };
  const selected = selectedSessions(view, record.id, combination);
  expect(selected[0].revision).toEqual(revision);
  const changed = selected.map((session) => mode === "same" ? session : mode === "revision" ? { ...session, revision: { ...revision, revisionId: "d".repeat(64) } } : { ...session, included: false });
  if (mode === "failure") {
    await expect(persistStrategySessionSelection(client, view, record, combination, changed)).rejects.toThrow("conflict");
    expect(view.planningByEvent[record.id]).toEqual(planning);
    expect(view.events[0].combination.sessions[0].included).toBe(true);
    return;
  }
  const saved = await persistStrategySessionSelection(client, view, record, combination, changed);
  expect(saved.events[0].combination?.sessions[0].revision).toEqual(changed[0].revision);
  expect(saved.events[0].planningInputs?.overrides).toEqual(planning.overrides);
  if (mode === "same") {
    expect(saved.events[0].planningInputs?.projection).toEqual(projection);
    expect(saved.planningByEvent[record.id]).toEqual(planning);
  } else {
    expect(saved.events[0].planningInputs?.projection).toBeUndefined();
    expect(saved.planningByEvent[record.id]).toBeUndefined();
    expect(saved.planningStatusByEvent[record.id]).toBeUndefined();
  }
  expect(view.planningByEvent[record.id]).toEqual(planning);
});
