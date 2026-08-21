import { describe, expect, it } from "vitest";
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
