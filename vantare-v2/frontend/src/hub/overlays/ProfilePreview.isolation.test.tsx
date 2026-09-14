import { render, cleanup } from "@testing-library/react";
import { describe, expect, it, afterEach, beforeAll, vi } from "vitest";
import { registerBuiltinDesignSystems } from "../registry/builtin-systems";
import { ProfilePreview } from "./ProfilePreview";
import type { ProfileConfig } from "../../lib/profile";
import type { WidgetRuntimeInput } from "../../overlay/core/widget-definition";
import type { AuthoringV2Scenario } from "../../overlay/authoring/fixtures/authoring-v2-scenario-fixture";

// Espía la factory pura C2a sin ocultar el contrato: cada llamada construye
// el runtime real y solo se registran identidad y escenario para probar
// ownership y args exactos.
const seen: WidgetRuntimeInput[] = [];
const seenScenarios: AuthoringV2Scenario[] = [];
vi.mock("../../overlay/authoring/fixtures/authoring-v2-scenario-fixture", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("../../overlay/authoring/fixtures/authoring-v2-scenario-fixture")
  >();
  return {
    ...actual,
    buildAuthoringV2ScenarioRuntime: (scenario: AuthoringV2Scenario) => {
      const runtime = actual.buildAuthoringV2ScenarioRuntime(scenario);
      seen.push(runtime);
      seenScenarios.push(scenario);
      return runtime;
    },
  };
});

beforeAll(() => {
  registerBuiltinDesignSystems();
});

afterEach(() => {
  cleanup();
  seen.length = 0;
  seenScenarios.length = 0;
});

function standingsProfile(id: string): ProfileConfig {
  return {
    id,
    name: id,
    displayMode: "racing",
    monitorIndex: 0,
    widgets: [
      { id: `${id}-standings`, type: "standings", enabled: true, updateHz: 15, position: { x: 0, y: 0, w: 320, h: 550 } },
    ],
  };
}

describe("ProfilePreview V2 isolation (C2b3)", () => {
  it("construye un runtime por instancia: mutar standings en una no contamina a la otra", () => {
    render(<ProfilePreview profile={standingsProfile("a")} />);
    render(<ProfilePreview profile={standingsProfile("b")} />);

    // Dos consumidores vivos, cada uno con su runtime del Host real.
    expect(document.querySelectorAll('[data-widget-renderer="standings"]')).toHaveLength(2);
    expect(seen.length).toBeGreaterThanOrEqual(2);
    // La factory recibe el escenario canónico exacto en cada llamada: sin
    // mock falso, la implementación real construye cada runtime.
    for (const scenario of seenScenarios) {
      expect(scenario).toEqual({
        session: "race",
        location: "track",
        state: "ready",
        widget: "standings",
        system: "vantare-crystal",
        variant: "default",
      });
    }
    const [first, second] = seen;
    expect(first.overlayV2Frame).not.toBe(second.overlayV2Frame);
    expect(first.overlayV2Frame).toEqual(second.overlayV2Frame);

    // Cast explícito a mutable solo en el test: el contrato productivo sigue
    // readonly y ningún preview muta el runtime ajeno.
    const mutable = first.overlayV2Frame as unknown as {
      standings: { driver?: string }[];
    };
    const driverBefore = second.overlayV2Frame?.standings[0]?.driver;
    mutable.standings[0]!.driver = "Intruso";
    expect(second.overlayV2Frame?.standings[0]?.driver).toBe(driverBefore);
    expect(second.overlayV2Frame?.standings[0]?.driver).not.toBe("Intruso");
  });
});
