import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildAuthoringV2Runtime,
  PREVIEW_V2_RUNTIME,
  type AuthoringV2Scenario,
} from "./authoring-v2-fixture";

function scenario(overrides: Partial<AuthoringV2Scenario> = {}): AuthoringV2Scenario {
  return {
    session: "race",
    location: "track",
    state: "ready",
    widget: "standings",
    system: "vantare-endurance",
    ...overrides,
  };
}

describe("authoring V2 fixture puro (C2)", () => {
  it("construye runtime V2 desde un escenario explícito, sin snapshot legacy", () => {
    const runtime = buildAuthoringV2Runtime(scenario());
    expect(runtime.overlayV2Frame).toBeDefined();
    expect(runtime.overlayV2Source).toBeDefined();
    expect(runtime.overlayV2Source?.state).toBe("live");
  });

  it("es determinista: el mismo escenario produce el mismo frame", () => {
    const first = JSON.stringify(buildAuthoringV2Runtime(scenario()));
    const second = JSON.stringify(buildAuthoringV2Runtime(scenario()));
    expect(first).toBe(second);
  });

  it("publica el campo multiclass con más de una clase para standings", () => {
    const runtime = buildAuthoringV2Runtime(scenario());
    const rows = runtime.overlayV2Frame?.standings ?? [];
    expect(rows.length).toBeGreaterThan(1);
    expect(new Set(rows.map((row) => row.classId)).size).toBeGreaterThan(1);
    const playerId = runtime.overlayV2Frame?.player.id;
    expect(rows.some((row) => row.id === playerId)).toBe(true);
  });

  it("mapea cada estado de datos a su source V2 sin snapshot", () => {
    expect(buildAuthoringV2Runtime(scenario({ state: "ready" })).overlayV2Source?.state).toBe("live");
    expect(buildAuthoringV2Runtime(scenario({ state: "stale" })).overlayV2Source?.state).toBe("stale");
    expect(
      buildAuthoringV2Runtime(scenario({ state: "disconnected" })).overlayV2Source?.state,
    ).toBe("stopped");
    expect(buildAuthoringV2Runtime(scenario({ state: "error" })).overlayV2Source?.state).toBe(
      "error",
    );
  });

  it("no depende del snapshot legacy, mocks V1, Date.now ni transporte legacy", () => {
    const source = readFileSync(join(process.cwd(), "src/overlay/authoring/fixtures/authoring-v2-fixture.ts"), "utf8");
    for (const anchor of [
      "TelemetrySnapshot",
      "buildMockTelemetry",
      "Date.now",
      "overlay-projection-adapter",
      "projection-telemetry-adapter",
      "overlay-v2-shadow-runtime",
      "transports/telemetry-adapter",
    ]) {
      expect(source, `el fixture V2 puro no puede mencionar ${anchor}`).not.toContain(anchor);
    }
  });

  it("expone un runtime de preview listo para las superficies Hub", () => {
    expect(PREVIEW_V2_RUNTIME.overlayV2Frame).toBeDefined();
    expect(PREVIEW_V2_RUNTIME.overlayV2Source?.state).toBe("live");
    expect((PREVIEW_V2_RUNTIME.overlayV2Frame?.standings ?? []).length).toBeGreaterThan(1);
  });
});
