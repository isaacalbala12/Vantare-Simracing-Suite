import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { OverlayFrameV2, OverlayUpdateV2 } from "../../../generated/telemetry";
import { carDamageNumbersDefinition } from "./car-damage-numbers-definition";
import {
  OVERLAY_V2_DAMAGE_DECLARED_GAPS,
  OVERLAY_V2_DAMAGE_INTENTIONAL_DIFFERENCES,
  buildCarDamageNumbersViewModelV2,
  carDamageNumbersDisplayedValues,
} from "./car-damage-numbers-view-model-v2";

const CONTENT = carDamageNumbersDefinition.parseContent({});

describe("car damage v2 view model", () => {
  it("reads the dents published by Go without recomputing", () => {
    const frame = goldenFrame(20);
    expect(frame.damage.dents.q).toBe("fresh");
    const model = buildCarDamageNumbersViewModelV2(frame, { state: "live" }, CONTENT);
    // Dents [1,2,3,4,5,6,7,8] -> fractions [0.5,1,1,1,1,1,1,1] -> body 1, aero 1, suspension 1
    expect(model.body).toBe(1);
    expect(model.aero).toBe(1);
    expect(model.suspension).toBe(1);
  });

  it("leaves tyres undefined instead of inventing it", () => {
    const model = buildCarDamageNumbersViewModelV2(goldenFrame(20), { state: "live" }, CONTENT);
    expect(model.tyres).toBeUndefined();
    expect(OVERLAY_V2_DAMAGE_DECLARED_GAPS).toEqual(expect.arrayContaining(["tyres"]));
    expect(OVERLAY_V2_DAMAGE_INTENTIONAL_DIFFERENCES).toEqual(
      expect.arrayContaining(["body", "aero", "suspension"]),
    );
  });

  it("maps fresh zero dents to missing and preserves invalid", () => {
    const frame = goldenFrame(20);
    const zero = {
      ...frame,
      damage: { ...frame.damage, dents: { q: "fresh", v: [0, 0, 0, 0, 0, 0, 0, 0] } },
    } as OverlayFrameV2;
    const model = buildCarDamageNumbersViewModelV2(zero, { state: "live" }, CONTENT);
    expect(model.body).toBeUndefined();
    expect(model.aero).toBeUndefined();

    const missing = buildCarDamageNumbersViewModelV2(
      { ...frame, damage: { ...frame.damage, dents: { q: "missing" } } },
      { state: "live" },
      CONTENT,
    );
    expect(missing.body).toBeUndefined();
    expect(missing.status).toBe("ready");
  });

  it("propagates the source lifecycle instead of rendering a stale dent as ready", () => {
    const frame = goldenFrame(20);
    expect(buildCarDamageNumbersViewModelV2(frame, { state: "stale" }, CONTENT).status).toBe("stale");
    const stopped = buildCarDamageNumbersViewModelV2(frame, { state: "stopped" }, CONTENT);
    expect(stopped.status).toBe("disconnected");
    expect(stopped.body).toBeUndefined();
  });

  it("exposes a stable displayed projection for the shadow comparator (gate live only)", () => {
    const displayed = carDamageNumbersDisplayedValues(
      buildCarDamageNumbersViewModelV2(goldenFrame(20), { state: "live" }, CONTENT),
    );
    expect(Object.keys(displayed).sort()).toEqual(["aero", "body", "status", "suspension", "tyres"]);
    expect(displayed.body).toBe("1.000");
  });
});

function goldenFrame(vehicles: number): OverlayFrameV2 {
  const update = JSON.parse(
    readFileSync(path.resolve(process.cwd(), `../internal/telemetry/projection/overlayv2/testdata/overlay_v2_${vehicles}.golden.json`), "utf8"),
  ) as OverlayUpdateV2;
  if (!update.frame) throw new Error("golden frame missing");
  return update.frame;
}
