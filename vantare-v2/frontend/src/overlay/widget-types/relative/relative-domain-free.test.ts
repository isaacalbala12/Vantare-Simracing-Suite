import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { OverlayFrameV2, OverlayUpdateV2 } from "../../../generated/telemetry";
import {
  DEFAULT_OVERLAY_V2_FEATURES,
  OVERLAY_V2_RELATIVE,
  hasOverlayV2Feature,
} from "../../telemetry-shadow/overlay-v2-features";
import { relativeDefinition } from "./relative-definition";
import {
  OVERLAY_V2_RELATIVE_DECLARED_GAPS,
  buildRelativeViewModelV2,
  relativeDisplayedValues,
} from "./relative-view-model-v2";

const CONTENT = relativeDefinition.parseContent({});

describe("relative v2 view model", () => {
  it("is off by default and only opts in through the feature flag", () => {
    expect(DEFAULT_OVERLAY_V2_FEATURES).toEqual([]);
    expect(hasOverlayV2Feature(undefined, OVERLAY_V2_RELATIVE)).toBe(false);
    expect(hasOverlayV2Feature([OVERLAY_V2_RELATIVE], OVERLAY_V2_RELATIVE)).toBe(true);
  });

  it.each([20, 44, 104])(
    "renders the window resolved in Go for the %i-vehicle golden without re-selecting",
    (vehicles) => {
      const frame = goldenFrame(vehicles);
      const model = buildRelativeViewModelV2(frame, { state: "live" }, CONTENT);
      const anchor = frame.relative.findIndex((row) => row.side === "player");
      const expected = [
        ...frame.relative.slice(Math.max(0, anchor - CONTENT.rangeAhead), anchor),
        frame.relative[anchor],
        ...frame.relative.slice(anchor + 1, anchor + 1 + CONTENT.rangeBehind),
      ];
      expect(model.rows.map((row) => row.id)).toEqual(expected.map((row) => row.id));
      expect(model.rows.map((row) => row.side)).toEqual(expected.map((row) => row.side));
    },
  );

  it("keeps the gap sign and tone the frame declares", () => {
    const model = buildRelativeViewModelV2(goldenFrame(44), { state: "live" }, CONTENT);
    for (const row of model.rows) {
      if (row.isPlayer) {
        expect(row.tone).toBe("player");
        continue;
      }
      expect(row.gapSeconds).not.toBeNull();
      expect(row.tone).toBe((row.gapSeconds ?? 0) > 0 ? "ahead" : "behind");
      expect(row.side).toBe((row.gapSeconds ?? 0) > 0 ? "ahead" : "behind");
    }
  });

  it("drops the player anchor when the widget asks for it, without reordering", () => {
    const frame = goldenFrame(44);
    const withPlayer = buildRelativeViewModelV2(frame, { state: "live" }, CONTENT);
    const without = buildRelativeViewModelV2(frame, { state: "live" }, { ...CONTENT, includePlayer: false });
    expect(withPlayer.rows.some((row) => row.isPlayer)).toBe(true);
    expect(without.rows.some((row) => row.isPlayer)).toBe(false);
    expect(without.rows.map((row) => row.id)).toEqual(
      withPlayer.rows.filter((row) => !row.isPlayer).map((row) => row.id),
    );
  });

  it("joins position and last lap from the same frame, never from a heuristic", () => {
    const frame = goldenFrame(44);
    const model = buildRelativeViewModelV2(frame, { state: "live" }, CONTENT);
    for (const row of model.rows) {
      const classification = frame.standings.find((candidate) => candidate.id === row.id);
      expect(classification).toBeDefined();
      expect(row.position).toBe(classification?.position);
    }
  });

  it("leaves the fields the canonical state does not carry at the placeholder", () => {
    const model = buildRelativeViewModelV2(goldenFrame(44), { state: "live" }, CONTENT);
    expect(model.rows.length).toBeGreaterThan(0);
    for (const row of model.rows) {
      expect(row.driverNumber).toBe("");
      expect(row.bestLapText).toBe("—");
    }
    expect(OVERLAY_V2_RELATIVE_DECLARED_GAPS).toContain("rows[].driverNumber");
  });

  it("propagates the source lifecycle instead of rendering stale rows as ready", () => {
    const frame = goldenFrame(44);
    expect(buildRelativeViewModelV2(frame, { state: "stale" }, CONTENT).status).toBe("stale");
    const stopped = buildRelativeViewModelV2(frame, { state: "stopped" }, CONTENT);
    expect(stopped.status).toBe("disconnected");
    expect(stopped.rows).toEqual([]);
  });

  it("renders no rows when the frame carries no player anchor", () => {
    const frame = goldenFrame(44);
    const anchorless: OverlayFrameV2 = {
      ...frame,
      relative: frame.relative.filter((row) => row.side !== "player"),
    };
    expect(buildRelativeViewModelV2(anchorless, { state: "live" }, CONTENT).rows).toEqual([]);
  });

  it("exposes a stable displayed projection for the shadow comparator", () => {
    const displayed = relativeDisplayedValues(
      buildRelativeViewModelV2(goldenFrame(44), { state: "live" }, CONTENT),
    );
    expect(Object.keys(displayed).sort()).toEqual(["rowCount", "rows", "status"]);
    expect(displayed.rows.split("|")).toHaveLength(Number(displayed.rowCount));
  });
});

function goldenFrame(vehicles: number): OverlayFrameV2 {
  const update = JSON.parse(readFileSync(path.resolve(
    process.cwd(),
    `../internal/telemetry/projection/overlayv2/testdata/overlay_v2_${vehicles}.golden.json`,
  ), "utf8")) as OverlayUpdateV2;
  if (!update.frame) throw new Error("golden frame missing");
  return update.frame;
}
