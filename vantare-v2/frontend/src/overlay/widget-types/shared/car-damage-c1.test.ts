import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { OverlayFrameV2, OverlayUpdateV2 } from "../../../generated/telemetry";
import { buildMockTelemetry } from "../../core/mock-scenarios";
import { carDamageNumbersDefinition } from "../car-damage-numbers/car-damage-numbers-definition";
import {
  OVERLAY_V2_DAMAGE_DECLARED_GAPS as NUMBERS_DECLARED_GAPS,
  buildCarDamageNumbersViewModelV2,
} from "../car-damage-numbers/car-damage-numbers-view-model-v2";
import { carDamageVisualDefinition } from "../car-damage-visual/car-damage-visual-definition";
import {
  OVERLAY_V2_DAMAGE_VISUAL_DECLARED_GAPS as VISUAL_DECLARED_GAPS,
  buildCarDamageVisualViewModelV2,
} from "../car-damage-visual/car-damage-visual-view-model-v2";

// C1 (ISA-894, rama B): las definitions de daño ya no resuelven por
// snapshot passthrough. La evidencia demuestra cero productores reales de
// snapshot.damage (solo fixtures sintéticas de authoring/harness y tests);
// la autoridad productiva es el frame V2 vía overlayV2ViewModelRegistry.
// wheelDetachedCount viaja en el frame pero ningún renderer lo consume:
// decisión deliberada B, sin campo canónico nuevo.

const INJECTED_DAMAGE = {
  body: 0.9,
  aero: 0.8,
  suspension: 0.7,
  tyres: [0.95, 0.94, 0.93, 0.92] as [number, number, number, number],
};

describe("car damage C1: definitions sin passthrough V1 (rama B)", () => {
  it("visual ignora snapshot.damage aunque venga inyectado", () => {
    const base = buildMockTelemetry({ session: "race", location: "track" });
    const model = carDamageVisualDefinition.buildViewModel(
      { ...base, damage: INJECTED_DAMAGE },
      carDamageVisualDefinition.parseContent({}),
    );
    expect(model.status).toBe("missing");
    expect(model.body).toBeUndefined();
    expect(model.aero).toBeUndefined();
    expect(model.suspension).toBeUndefined();
    expect(model.tyres).toBeUndefined();
  });

  it("numbers ignora snapshot.damage aunque venga inyectado", () => {
    const base = buildMockTelemetry({ session: "race", location: "track" });
    const model = carDamageNumbersDefinition.buildViewModel(
      { ...base, damage: INJECTED_DAMAGE },
      carDamageNumbersDefinition.parseContent({}),
    );
    expect(model.status).toBe("missing");
    expect(model.body).toBeUndefined();
    expect(model.aero).toBeUndefined();
    expect(model.suspension).toBeUndefined();
    expect(model.tyres).toBeUndefined();
  });

  it("el builder V2 visual mapea dents canónicos y deja tyres sin inventar", () => {
    const frame = goldenFrame(20);
    expect(frame.damage.dents.q).toBe("fresh");
    const model = buildCarDamageVisualViewModelV2(
      frame,
      { state: "live" },
      carDamageVisualDefinition.parseContent({}),
    );
    // Dents [1,2,3,4,5,6,7,8] -> fractions [0.5,1,1,1,1,1,1,1].
    expect(model.body).toBe(1);
    expect(model.aero).toBe(1);
    expect(model.suspension).toBe(1);
    expect(model.tyres).toBeUndefined();
  });

  it("wheelDetachedCount queda declarado gap: viaja en frame, no se renderiza", () => {
    expect(VISUAL_DECLARED_GAPS).toEqual(expect.arrayContaining(["wheelDetachedCount"]));
    expect(NUMBERS_DECLARED_GAPS).toEqual(expect.arrayContaining(["wheelDetachedCount"]));
    const frame = goldenFrame(20);
    expect(frame.damage.wheelDetachedCount.q).toBe("fresh");
    const visual = buildCarDamageVisualViewModelV2(
      frame,
      { state: "live" },
      carDamageVisualDefinition.parseContent({}),
    );
    const numbers = buildCarDamageNumbersViewModelV2(
      frame,
      { state: "live" },
      carDamageNumbersDefinition.parseContent({}),
    );
    expect("wheelDetachedCount" in visual).toBe(false);
    expect("wheelDetachedCount" in numbers).toBe(false);
  });
});

function goldenFrame(vehicles: number): OverlayFrameV2 {
  const update = JSON.parse(
    readFileSync(
      path.resolve(
        process.cwd(),
        `../internal/telemetry/projection/overlayv2/testdata/overlay_v2_${vehicles}.golden.json`,
      ),
      "utf8",
    ),
  ) as OverlayUpdateV2;
  if (!update.frame) throw new Error("golden frame missing");
  return update.frame;
}
