import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { OverlayUpdateV2 } from "../../../generated/telemetry";
import {
  buildRacingFlagsViewModelV2,
} from "./racing-flags-view-model-v2";

const CONTENT = { showSectorFlags: true, hideWhenGreen: true } as const;

describe("racing-flags v2 view model", () => {
  it("keeps the flag absent while the canonical state has no flag signal", () => {
    const update = golden(1);
    if (!update.frame) throw new Error("golden frame missing");
    expect(update.frame.session.flag.q).toBe("missing");
    const model = buildRacingFlagsViewModelV2(update.frame, update.source, CONTENT);
    expect(model.globalFlag).toBeUndefined();
    expect(model.sectorFlags).toEqual([]);
    expect(model.hidden).toBe(false);
  });

  it("reads only the session slice: no vehicle, scoring or history input", () => {
    const update = golden(104);
    if (!update.frame) throw new Error("golden frame missing");
    const sessionOnly = {
      ...update.frame,
      standings: [],
      relative: [],
      player: { ...update.frame.player, gear: { q: "missing" as const } },
    };
    expect(buildRacingFlagsViewModelV2(sessionOnly, update.source, CONTENT)).toEqual(
      buildRacingFlagsViewModelV2(update.frame, update.source, CONTENT),
    );
  });

  it("propagates the source lifecycle without inventing a flag", () => {
    const update = golden(1);
    if (!update.frame) throw new Error("golden frame missing");
    const stale = buildRacingFlagsViewModelV2(update.frame, { state: "stale" }, CONTENT);
    expect(stale.status).toBe("stale");
    const stopped = buildRacingFlagsViewModelV2(update.frame, { state: "stopped" }, CONTENT);
    expect(stopped.status).toBe("disconnected");
    expect(stopped.globalFlag).toBeUndefined();
  });
});

function golden(vehicles: number): OverlayUpdateV2 {
  return JSON.parse(readFileSync(path.resolve(
    process.cwd(),
    `../internal/telemetry/projection/overlayv2/testdata/overlay_v2_${vehicles}.golden.json`,
  ), "utf8")) as OverlayUpdateV2;
}
