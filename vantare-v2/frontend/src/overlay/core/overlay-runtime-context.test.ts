import { describe, expect, it } from "vitest";
import type {
  OverlayFrameV2,
  OverlaySourceStatusV2,
} from "../../generated/telemetry";
import { buildOverlayRuntimeContext } from "./overlay-runtime-context";

function frameFixture(): OverlayFrameV2 {
  return {
    player: { id: "player-7" },
    session: { phase: { q: "fresh", v: "race" } },
    standings: [
      { id: "rival-2", pit: "track" },
      { id: "player-7", pit: "pit" },
    ],
    capabilities: {
      available: { standings: "fresh", spatial: "stale" },
      modes: { delta: ["personal-best"], gaps: "official", spatial: ["lap-distance"], standings: "official" },
      supported: ["session", "standings", "spatial"],
    },
  } as OverlayFrameV2;
}

describe("buildOverlayRuntimeContext", () => {
  it("deriva solo el contexto mínimo de frame y estado V2", () => {
    const frame = frameFixture();
    const source: OverlaySourceStatusV2 = { state: "live", reason: "lmu-shm" };

    expect(buildOverlayRuntimeContext(frame, source)).toEqual({
      sourceState: "live",
      sourceReason: "lmu-shm",
      sessionType: "race",
      playerPresent: true,
      playerInPit: true,
      vehicleCount: 2,
      capabilities: frame.capabilities,
    });
  });

  it("conserva una fase stale utilizable sin confundir missing o invalid con sesión real", () => {
    const frame = frameFixture();
    expect(buildOverlayRuntimeContext({
      ...frame,
      session: { ...frame.session, phase: { q: "stale", v: "qualifying" } },
    }, { state: "stale" }).sessionType).toBe("qualifying");

    for (const q of ["missing", "invalid"] as const) {
      expect(buildOverlayRuntimeContext({
        ...frame,
        session: { ...frame.session, phase: { q, v: "race" } },
      }, { state: "live" }).sessionType).toBeUndefined();
    }
  });

  it("expone ausencia sin fabricar jugador, pit, coches, sesión o capabilities", () => {
    expect(buildOverlayRuntimeContext(undefined, { state: "error", reason: "invalid frame" })).toEqual({
      sourceState: "error",
      sourceReason: "invalid frame",
      sessionType: undefined,
      playerPresent: false,
      playerInPit: undefined,
      vehicleCount: 0,
      capabilities: undefined,
    });
  });

  it("no atribuye el estado de pit de otro coche al jugador", () => {
    const frame = frameFixture();
    expect(buildOverlayRuntimeContext({
      ...frame,
      player: { ...frame.player, id: "unknown-player" },
    }, { state: "live" })).toMatchObject({
      playerPresent: true,
      playerInPit: undefined,
      vehicleCount: 2,
    });
  });
});
