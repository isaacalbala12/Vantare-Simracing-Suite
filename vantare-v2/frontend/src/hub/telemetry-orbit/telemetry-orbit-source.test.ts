import { describe, expect, it, vi } from "vitest";
import type {
  StrategyApplicationClient,
  StrategyApplicationResultV1,
} from "../../strategy/strategy-application-client";
import { loadRealTelemetrySessions } from "./telemetry-orbit-source";

describe("loadRealTelemetrySessions", () => {
  it("aplana el catálogo Analysis sin convertir ausencias en ceros", async () => {
    const execute = vi.fn().mockResolvedValue({
      protocolVersion: "strategy.application.v1",
      commandId: "result",
      repositoryVersion: 3,
      sessionCatalogStatus: "available",
      sessionCombinations: [
        {
          combinationId: "lmu:combo",
          simId: "lmu",
          trackName: "Sebring",
          trackLayout: "12h",
          carName: "Porsche 911 GT3 R",
          carClass: "LMGT3",
          sessionCount: 1,
          raceCount: 0,
          lastActivity: "2026-08-26T16:42:00Z",
          climateBuckets: [],
          sessions: [
            {
              sessionId: "session-real-1",
              type: "practice",
              status: "identified_usable",
              defaultIncluded: true,
              lastActivity: "2026-08-26T16:42:00Z",
              climateBuckets: [{ bucket: "dry", laps: 7 }],
            },
          ],
        },
      ],
      recoveredFromBackup: false,
      closed: false,
    } satisfies StrategyApplicationResultV1<unknown>);
    const client = {
      execute,
      cancel: vi.fn(),
      dispose: vi.fn(),
    } as unknown as StrategyApplicationClient<unknown>;

    await expect(
      loadRealTelemetrySessions(
        client,
        "es-ES",
        "Europe/Madrid",
      ),
    ).resolves.toEqual([
      {
        id: "session-real-1",
        track: "Sebring · 12h",
        car: "Porsche 911 GT3 R · LMGT3",
        when: "26 ago, 18:42",
        laps: 7,
        best: null,
      },
    ]);
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({ operation: "list_session_combinations" }),
    );
  });
});
