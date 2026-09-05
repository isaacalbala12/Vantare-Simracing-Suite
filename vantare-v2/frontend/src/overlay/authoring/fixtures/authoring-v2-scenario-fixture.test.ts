import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import goldenV2Raw from "../../../../../internal/telemetry/projection/overlayv2/testdata/overlay_v2_20.golden.json?raw";
import type { OverlayUpdateV2 } from "../../../generated/telemetry";
import {
  AUTHORING_V2_VARIANTS,
  buildAuthoringV2ScenarioRuntime,
  type AuthoringV2Scenario,
} from "./authoring-v2-scenario-fixture";

const canonical = JSON.parse(goldenV2Raw) as OverlayUpdateV2;

function scenario(overrides: Partial<AuthoringV2Scenario> = {}): AuthoringV2Scenario {
  return {
    session: "race",
    location: "track",
    state: "ready",
    widget: "standings",
    system: "vantare-endurance",
    variant: "default",
    ...overrides,
  };
}

describe("authoring V2 fixture puro (C2)", () => {
  it("parte del golden V2 canónico sin rellenar secciones sin productor", () => {
    const runtime = buildAuthoringV2ScenarioRuntime(scenario());
    expect(runtime.overlayV2Source).toEqual(canonical.source);
    const { session: scenarioSession, standings: scenarioStandings, ...scenarioRest } =
      runtime.overlayV2Frame!;
    const { session: canonicalSession, standings: canonicalStandings, ...canonicalRest } =
      canonical.frame!;
    // Sin secciones rellenadas: todo lo demás es el canónico exacto.
    expect(scenarioRest).toEqual(canonicalRest);
    expect(scenarioSession.track).toEqual(canonicalSession.track);
    expect(scenarioSession.phase).toEqual({ v: "race", q: "fresh" });
    // Location track especializa el pit del jugador; el resto, intacto.
    expect(scenarioStandings.map((row) => row.id)).toEqual(
      canonicalStandings.map((row) => row.id),
    );
    const playerId = runtime.overlayV2Frame!.player.id;
    expect(scenarioStandings.find((row) => row.id === playerId)?.pit).toBe("track");
    for (const row of scenarioStandings) {
      if (row.id !== playerId) {
        expect(row).toEqual(canonicalStandings.find((candidate) => candidate.id === row.id));
      }
    }
  });

  it("es determinista: el mismo escenario produce el mismo frame", () => {
    const first = JSON.stringify(buildAuthoringV2ScenarioRuntime(scenario()));
    const second = JSON.stringify(buildAuthoringV2ScenarioRuntime(scenario()));
    expect(first).toBe(second);
  });

  it("mantiene el mismo frame para todas las variantes shape-only", () => {
    const expected = buildAuthoringV2ScenarioRuntime(scenario()).overlayV2Frame;
    for (const variant of AUTHORING_V2_VARIANTS) {
      expect(buildAuthoringV2ScenarioRuntime(scenario({ variant })).overlayV2Frame).toEqual(expected);
    }
  });

  it("publica el campo multiclass con más de una clase para standings", () => {
    const runtime = buildAuthoringV2ScenarioRuntime(
      scenario({ variant: "standings-multiclass" }),
    );
    const rows = runtime.overlayV2Frame?.standings ?? [];
    expect(rows.length).toBeGreaterThan(1);
    expect(new Set(rows.map((row) => row.classId)).size).toBeGreaterThan(1);
    const playerId = runtime.overlayV2Frame?.player.id;
    expect(rows.some((row) => row.id === playerId)).toBe(true);
    const { standings: canonicalStandings, ...canonicalRest } = canonical.frame!;
    const { standings: scenarioStandings, ...scenarioRest } = runtime.overlayV2Frame!;
    expect(canonicalStandings.length).toBeGreaterThan(1);
    // Mismo campo multiclass, salvo el pit del jugador (location track).
    expect(scenarioStandings.map((row) => row.id)).toEqual(
      canonicalStandings.map((row) => row.id),
    );
    for (const row of scenarioStandings) {
      const expected = canonicalStandings.find((candidate) => candidate.id === row.id)!;
      expect(row).toEqual(
        row.id === playerId ? { ...expected, pit: "track" } : expected,
      );
    }
    expect(scenarioRest).toEqual(canonicalRest);
  });

  it("conserva trackName y relative.side/authority del productor canónico", () => {
    const trackMap = buildAuthoringV2ScenarioRuntime(
      scenario({ widget: "track-map", variant: "default" }),
    );
    const relative = buildAuthoringV2ScenarioRuntime(
      scenario({ widget: "relative", variant: "default" }),
    );
    expect(trackMap.overlayV2Frame?.session.track).toEqual(canonical.frame?.session.track);
    expect(relative.overlayV2Frame?.relative).toEqual(canonical.frame?.relative);
  });

  it("mapea cada estado de datos a su source V2 sin snapshot", () => {
    expect(buildAuthoringV2ScenarioRuntime(scenario({ state: "ready" })).overlayV2Source?.state).toBe("live");
    expect(buildAuthoringV2ScenarioRuntime(scenario({ state: "stale" })).overlayV2Source?.state).toBe("stale");
    expect(
      buildAuthoringV2ScenarioRuntime(scenario({ state: "disconnected" })).overlayV2Source?.state,
    ).toBe("stopped");
    expect(buildAuthoringV2ScenarioRuntime(scenario({ state: "error" })).overlayV2Source?.state).toBe(
      "error",
    );
  });

  it("no depende del snapshot legacy, mocks V1, Date.now ni transporte legacy", () => {
    const source = readFileSync(join(process.cwd(), "src/overlay/authoring/fixtures/authoring-v2-scenario-fixture.ts"), "utf8");
    for (const anchor of [
      "TelemetrySnapshot",
      "buildMockTelemetry",
      "Date.now",
      "overlay-projection-adapter",
      "projection-telemetry-adapter",
      "overlay-v2-shadow-runtime",
      "transports/telemetry-adapter",
      "side:",
      "authority:",
    ]) {
      expect(source, `el fixture V2 puro no puede mencionar ${anchor}`).not.toContain(anchor);
    }
    expect(source).toContain("overlay_v2_20.golden.json?raw");
  });

  it("devuelve clones distintos con el mismo contenido en cada invocación", () => {
    const first = buildAuthoringV2ScenarioRuntime(scenario());
    const second = buildAuthoringV2ScenarioRuntime(scenario());
    expect(first.overlayV2Frame).toEqual(second.overlayV2Frame);
    expect(first.overlayV2Frame).not.toBe(second.overlayV2Frame);
    expect(first.overlayV2Source).toEqual(second.overlayV2Source);
    expect(first.overlayV2Source).not.toBe(second.overlayV2Source);
  });

  it("aísla invocaciones: mutar session/relative/player no contamina al siguiente", () => {
    const first = buildAuthoringV2ScenarioRuntime(scenario());
    expect(first.overlayV2Frame?.session).not.toBe(canonical.frame?.session);
    expect(first.overlayV2Frame?.relative).not.toBe(canonical.frame?.relative);
    expect(first.overlayV2Frame?.player).not.toBe(canonical.frame?.player);
    expect(first.overlayV2Frame?.standings).not.toBe(canonical.frame?.standings);
    // Cast explícito a mutable solo en el test: el contrato productivo sigue
    // readonly y el fixture nunca muta la semilla.
    const mutable = first.overlayV2Frame as unknown as {
      session: { track: { v: string } };
      player: { id: string };
      relative: { name?: string }[];
    };
    mutable.session.track.v = "Mutado";
    mutable.player.id = "intruso";
    mutable.relative[0]!.name = "Intruso";
    const second = buildAuthoringV2ScenarioRuntime(scenario());
    // La semilla productiva sigue intacta: el frame nuevo iguala al canónico
    // de test salvo el pit del jugador (location track documentada).
    const { standings: secondStandings, ...secondRest } = second.overlayV2Frame!;
    const { standings: seedStandings, ...seedRest } = canonical.frame!;
    expect(secondRest).toEqual(seedRest);
    const seedPlayerId = second.overlayV2Frame!.player.id;
    expect(secondStandings.find((row) => row.id === seedPlayerId)?.pit).toBe("track");
    for (const row of secondStandings) {
      if (row.id !== seedPlayerId) {
        expect(row).toEqual(seedStandings.find((candidate) => candidate.id === row.id));
      }
    }
  });

  it("aplica scenario.session solo a frame.session.phase con quality canónica", () => {
    const runtime = buildAuthoringV2ScenarioRuntime(scenario({ session: "qualifying" }));
    expect(runtime.overlayV2Frame?.session.phase).toEqual({ v: "qualifying", q: "fresh" });
    const { session: canonicalSession, standings: canonicalStandings, ...canonicalRest } =
      canonical.frame!;
    const { session: scenarioSession, standings: scenarioStandings, ...scenarioRest } =
      runtime.overlayV2Frame!;
    expect(scenarioRest).toEqual(canonicalRest);
    expect(scenarioSession.track).toEqual(canonicalSession.track);
    // standings idéntico salvo el pit del jugador (location track del escenario).
    const playerId = runtime.overlayV2Frame!.player.id;
    expect(scenarioStandings.find((row) => row.id === playerId)?.pit).toBe("track");
    for (const row of scenarioStandings) {
      if (row.id !== playerId) {
        expect(row).toEqual(canonicalStandings.find((candidate) => candidate.id === row.id));
      }
    }
  });

  it("aplica scenario.location solo al pit de la fila del jugador canónico", () => {
    const playerId = canonical.frame!.player.id;
    const pits = buildAuthoringV2ScenarioRuntime(scenario({ location: "pits" }));
    const track = buildAuthoringV2ScenarioRuntime(scenario({ location: "track" }));
    const pitOf = (frame: typeof pits.overlayV2Frame) =>
      frame?.standings.find((row) => row.id === playerId)?.pit;
    expect(pitOf(pits.overlayV2Frame)).toBe("pit");
    expect(pitOf(track.overlayV2Frame)).toBe("track");
    // Sin coches/IDs inventados: el resto de filas conserva su pit canónico.
    const canonicalPits = new Map(canonical.frame!.standings.map((row) => [row.id, row.pit]));
    for (const row of pits.overlayV2Frame!.standings) {
      if (row.id !== playerId) {
        expect(row.pit).toBe(canonicalPits.get(row.id));
      }
    }
  });
});
