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
  RELATIVE_MEMBERSHIP_HOLD_MS,
  buildRelativeViewModelV2,
  createRelativeViewModelState,
  relativeDisplayedValues,
} from "./relative-view-model-v2";

const CONTENT = relativeDefinition.parseContent({});

describe("relative v2 view model", () => {
  it("is authoritative by default and remains explicitly addressable", () => {
    expect(DEFAULT_OVERLAY_V2_FEATURES).toContain(OVERLAY_V2_RELATIVE);
    expect(hasOverlayV2Feature(undefined, OVERLAY_V2_RELATIVE)).toBe(true);
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
    const source = goldenFrame(44);
    const frame: OverlayFrameV2 = {
      ...source,
      standings: source.standings.map((row) => (
        row.id === source.player.id ? { ...row, pit: "track" } : row
      )),
    };
    const model = buildRelativeViewModelV2(frame, { state: "live" }, CONTENT);
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

  it("keeps physical relative gaps while the player is in pit", () => {
    const model = buildRelativeViewModelV2(goldenFrame(44), { state: "live" }, CONTENT);
    expect(model.rows.some((row) => row.isPlayer)).toBe(true);
    expect(model.rows.filter((row) => !row.isPlayer).every((row) => row.gapSeconds !== null)).toBe(true);
    expect(model.rows.find((row) => row.isPlayer)?.gapText).toBe("—");
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

  it("takes position from the same relative snapshot as the gap", () => {
    const frame = goldenFrame(44);
    const visibleTargetId = buildRelativeViewModelV2(frame, { state: "live" }, CONTENT)
      .rows.find((row) => !row.isPlayer)!.id;
    const target = frame.relative.find((row) => row.id === visibleTargetId)!;
    const relativePosition = 27;
    const mixedEpochPosition = 26;
    const mismatched: OverlayFrameV2 = {
      ...frame,
      standings: frame.standings.map((row) => row.id === target.id
        ? { ...row, position: mixedEpochPosition, lastLap: { q: "fresh", v: 99 } }
        : row),
      relative: frame.relative.map((row) => row.id === target.id
        ? {
            ...row,
            position: relativePosition,
            gap: { q: "fresh", v: row.side === "ahead" ? 4.2 : -4.2 },
            lastLap: { q: "fresh", v: 91.234 },
            name: "RELATIVE-NOW",
            classId: "LMP2",
          }
        : row) as OverlayFrameV2["relative"],
    };

    const model = buildRelativeViewModelV2(mismatched, { state: "live" }, CONTENT);
    expect(model.rows.find((row) => row.id === target.id)).toMatchObject({
      position: relativePosition,
      lastLapText: "1:31.234",
      gapSeconds: target.side === "ahead" ? 4.2 : -4.2,
      driverName: "RELATIVE-NOW",
      vehicleClass: "LMP2",
    });
  });

  it.each([
    { scenario: "player stopped in pit with dense traffic", playerInPit: true },
    { scenario: "rival enters and exits pit for one tick", playerInPit: false },
  ])("holds a transient neighbour change: $scenario", ({ playerInPit }) => {
    const base = goldenFrame(44);
    const state = createRelativeViewModelState();
    const content = { ...CONTENT, rangeAhead: 1, rangeBehind: 1 };
    let nowMs = 0;
    const options = { state, nowMs: () => nowMs };
    const first = relativeScenarioFrame(base, 100, ["far-ahead", "stable-ahead"], ["stable-behind", "far-behind"], playerInPit);
    const transient = relativeScenarioFrame(base, 101, ["stable-ahead", "new-ahead"], ["new-behind", "stable-behind"], playerInPit);

    const accepted = buildRelativeViewModelV2(first, { state: "live" }, content, options);
    nowMs = 100;
    const held = buildRelativeViewModelV2(transient, { state: "live" }, content, options);
    nowMs = 200;
    const reverted = buildRelativeViewModelV2({ ...first, sequence: 102 }, { state: "live" }, content, options);

    expect(nonPlayerIds(accepted)).toEqual(["stable-ahead", "stable-behind"]);
    expect(nonPlayerIds(held)).toEqual(["stable-ahead", "stable-behind"]);
    expect(nonPlayerIds(reverted)).toEqual(["stable-ahead", "stable-behind"]);
  });

  it.each([1, 2, 5, 10])("uses elapsed monotonic milliseconds at %i Hz", (hz) => {
    const base = goldenFrame(44);
    const state = createRelativeViewModelState();
    const content = { ...CONTENT, rangeAhead: 1, rangeBehind: 1 };
    const intervalMs = 1000 / hz;
    let nowMs = 0;
    let sequence = 200;
    const options = { state, nowMs: () => nowMs };
    buildRelativeViewModelV2(relativeScenarioFrame(base, sequence, ["far-ahead", "old-ahead"], ["old-behind", "far-behind"], true), { state: "live" }, content, options);

    nowMs += intervalMs;
    sequence += 1;
    let model = buildRelativeViewModelV2(relativeScenarioFrame(base, sequence, ["old-ahead", "new-ahead"], ["new-behind", "old-behind"], true), { state: "live" }, content, options);
    const changedAtMs = nowMs;
    while (nowMs - changedAtMs < RELATIVE_MEMBERSHIP_HOLD_MS) {
      expect(nonPlayerIds(model)).toEqual(["old-ahead", "old-behind"]);
      nowMs += intervalMs;
      sequence += 1;
      model = buildRelativeViewModelV2(relativeScenarioFrame(base, sequence, ["old-ahead", "new-ahead"], ["new-behind", "old-behind"], true), { state: "live" }, content, options);
    }
    expect(nonPlayerIds(model)).toEqual(["new-ahead", "new-behind"]);
  });

  it("does not compare different VehicleIDs to bypass the hold at a spatial edge", () => {
    const base = goldenFrame(44);
    const state = createRelativeViewModelState();
    const content = { ...CONTENT, rangeAhead: 1, rangeBehind: 0 };
    let nowMs = 0;
    buildRelativeViewModelV2(relativeScenarioFrame(base, 300, ["far-ahead", "old-ahead"], [], true, {}, { "old-ahead": 100 }), { state: "live" }, content, { state, nowMs: () => nowMs });
    nowMs = 1;
    const replaced = buildRelativeViewModelV2(
      relativeScenarioFrame(base, 301, ["old-ahead", "new-ahead"], [], true, {}, { "old-ahead": 100, "new-ahead": 200 }),
      { state: "live" },
      content,
      { state, nowMs: () => nowMs, holdMs: 10_000 },
    );
    expect(nonPlayerIds(replaced)).toEqual(["old-ahead"]);
  });

  it("uses fresh canonical rows across start-finish wrap and a stopped-car pass", () => {
    const base = goldenFrame(44);
    const state = createRelativeViewModelState();
    const content = { ...CONTENT, rangeAhead: 1, rangeBehind: 1 };
    const before = relativeScenarioFrame(base, 400, ["ahead"], ["buemi"], true, { buemi: -0.2 });
    const after = relativeScenarioFrame(base, 401, ["buemi"], ["behind"], true, { buemi: 1.5 });

    let nowMs = 0;
    const options = { state, nowMs: () => nowMs };
    buildRelativeViewModelV2(before, { state: "live" }, content, options);
    nowMs = 10;
    const held = buildRelativeViewModelV2(after, { state: "live" }, content, options);
    nowMs = 910;
    const wrapped = buildRelativeViewModelV2(
      { ...after, sequence: 402 },
      { state: "live" },
      content,
      options,
    );
    const buemi = wrapped.rows.find((row) => row.id === "buemi");

    expect(held.rows.find((row) => row.id === "buemi")).toMatchObject({
      side: "behind",
      gapSeconds: -0.2,
      gapText: "-0.2",
    });
    expect(buemi).toMatchObject({ side: "ahead", gapSeconds: 1.5, gapText: "+1.5" });
    expect(wrapped.rows.filter((row) => row.id === "buemi")).toHaveLength(1);
  });

  it("keeps one accepted row snapshot while the same VehicleID crosses inside the hold", () => {
    const base = goldenFrame(44);
    const state = createRelativeViewModelState();
    const content = { ...CONTENT, rangeAhead: 1, rangeBehind: 1 };
    let nowMs = 0;
    const options = { state, nowMs: () => nowMs };
    const aheadBase = relativeScenarioFrame(base, 450, ["rival"], [], true, { rival: 0.3 });
    const behindBase = relativeScenarioFrame(base, 451, [], ["rival"], true, { rival: -0.1 });
    const ahead = {
      ...aheadBase,
      relative: aheadBase.relative.map((row) => row.id === "rival" ? { ...row, position: 19 } : row),
    } as OverlayFrameV2;
    const behind = {
      ...behindBase,
      relative: behindBase.relative.map((row) => row.id === "rival" ? { ...row, position: 20 } : row),
    } as OverlayFrameV2;

    const accepted = buildRelativeViewModelV2(ahead, { state: "live" }, content, options);
    nowMs = 100;
    const held = buildRelativeViewModelV2(behind, { state: "live" }, content, options);

    expect(accepted.rows.find((row) => row.id === "rival")).toMatchObject({
      position: 19,
      side: "ahead",
      gapSeconds: 0.3,
    });
    expect(held.rows.find((row) => row.id === "rival")).toMatchObject({
      position: 19,
      side: "ahead",
      gapSeconds: 0.3,
    });
  });

  it("ignores ahead-behind churn inside the hold and exposes a sustained crossing at its bound", () => {
    const base = goldenFrame(44);
    const state = createRelativeViewModelState();
    const content = { ...CONTENT, rangeAhead: 1, rangeBehind: 1 };
    let nowMs = 0;
    const options = { state, nowMs: () => nowMs };
    const ahead = relativeScenarioFrame(base, 460, ["rival"], [], true, { rival: 0.3 });
    const behind = relativeScenarioFrame(base, 461, [], ["rival"], true, { rival: -0.1 });

    buildRelativeViewModelV2(ahead, { state: "live" }, content, options);
    nowMs = 100;
    expect(buildRelativeViewModelV2(behind, { state: "live" }, content, options)
      .rows.find((row) => row.id === "rival")?.side).toBe("ahead");
    nowMs = 200;
    expect(buildRelativeViewModelV2({ ...ahead, sequence: 462 }, { state: "live" }, content, options)
      .rows.find((row) => row.id === "rival")?.side).toBe("ahead");
    nowMs = 300;
    expect(buildRelativeViewModelV2({ ...behind, sequence: 463 }, { state: "live" }, content, options)
      .rows.find((row) => row.id === "rival")?.side).toBe("ahead");
    nowMs = 1_199;
    expect(buildRelativeViewModelV2({ ...behind, sequence: 464 }, { state: "live" }, content, options)
      .rows.find((row) => row.id === "rival")?.side).toBe("ahead");
    nowMs = 1_200;
    expect(buildRelativeViewModelV2({ ...behind, sequence: 465 }, { state: "live" }, content, options)
      .rows.find((row) => row.id === "rival")).toMatchObject({
        side: "behind",
        gapSeconds: -0.1,
      });
  });

  it.each(["epoch", "session"] as const)("changes the motion scope on a ready %s reset", (reset) => {
    const base = goldenFrame(44);
    const first = buildRelativeViewModelV2(base, { state: "live" }, CONTENT, {
      instanceKey: "profile:widget",
    });
    const next = buildRelativeViewModelV2({
      ...base,
      epoch: reset === "epoch" ? base.epoch + 1 : base.epoch,
      sessionId: reset === "session" ? `${base.sessionId}-next` : base.sessionId,
      sequence: base.sequence + 1,
    }, { state: "live" }, CONTENT, { instanceKey: "profile:widget" });

    expect(next.presentationKey).not.toBe(first.presentationKey);
  });

  it("rehydrates accepted IDs from the current frame and removes vanished IDs", () => {
    const base = goldenFrame(44);
    const state = createRelativeViewModelState();
    const content = { ...CONTENT, rangeAhead: 1, rangeBehind: 1 };
    let nowMs = 0;
    const options = { state, nowMs: () => nowMs };
    const initial = relativeScenarioFrame(base, 500, ["far", "kept"], ["gone", "far-behind"], true);
    buildRelativeViewModelV2(initial, { state: "live" }, content, options);
    nowMs = 100;
    const changed = relativeScenarioFrame(base, 501, ["kept", "new"], ["replacement"], true, { kept: 7.5 }, { kept: 123, new: 130 });
    const model = buildRelativeViewModelV2(changed, { state: "live" }, content, options);

    expect(model.rows.find((row) => row.id === "kept")).toMatchObject({ gapSeconds: 7.5, position: 1 });
    expect(model.rows.some((row) => row.id === "gone")).toBe(false);
    expect(model.rows.some((row) => row.id === "replacement")).toBe(false);
  });

  it.each([
    { quality: "stale" as const, gapText: "+7.5", lastLapText: "1:30.000" },
    { quality: "missing" as const, gapText: "—", lastLapText: "—" },
  ])("preserves current-row $quality freshness while membership is held", ({ quality, gapText, lastLapText }) => {
    const base = goldenFrame(44);
    const state = createRelativeViewModelState();
    const content = { ...CONTENT, rangeAhead: 1, rangeBehind: 0 };
    let nowMs = 0;
    const options = { state, nowMs: () => nowMs };
    const initial = relativeScenarioFrame(base, 550, ["new", "kept"], [], true);
    buildRelativeViewModelV2(initial, { state: "live" }, content, options);
    nowMs = 100;
    const changed = relativeScenarioFrame(base, 551, ["kept", "new"], [], true, {}, { kept: 123, new: 130 });
    const relative = changed.relative.map((row) => row.id === "kept"
      ? {
          ...row,
          gap: quality === "missing" ? { q: quality } : { q: quality, v: 7.5 },
          lastLap: quality === "missing" ? { q: quality } : { q: quality, v: 90 },
        }
      : row) as OverlayFrameV2["relative"];
    const model = buildRelativeViewModelV2({ ...changed, relative }, { state: "live" }, content, options);

    expect(model.rows.find((row) => row.id === "kept")).toMatchObject({ gapText, lastLapText });
  });

  it("does not advance or revert membership on duplicate and out-of-order frames", () => {
    const base = goldenFrame(44);
    const state = createRelativeViewModelState();
    const content = { ...CONTENT, rangeAhead: 1, rangeBehind: 0 };
    let nowMs = 0;
    const options = { state, nowMs: () => nowMs, holdMs: 600 };
    const old = relativeScenarioFrame(base, 600, ["new", "old"], [], true);
    const changed = relativeScenarioFrame(base, 601, ["old", "new"], [], true, { new: 7.5 });
    buildRelativeViewModelV2(old, { state: "live" }, content, options);
    nowMs = 100;
    buildRelativeViewModelV2(changed, { state: "live" }, content, options);
    nowMs = 1000;
    expect(nonPlayerIds(buildRelativeViewModelV2(changed, { state: "live" }, content, options))).toEqual(["old"]);
    const accepted = buildRelativeViewModelV2({ ...changed, sequence: 602 }, { state: "live" }, content, options);
    expect(nonPlayerIds(accepted)).toEqual(["new"]);
    nowMs = 2000;
    expect(nonPlayerIds(buildRelativeViewModelV2(old, { state: "live" }, content, options))).toEqual(["new"]);
    const outOfOrder = buildRelativeViewModelV2({
      ...old,
      generatedAt: "2026-08-31T03:00:01Z",
      relative: old.relative.map((row) => row.id === "new" ? { ...row, gap: { q: "fresh", v: 99 } } : row),
    }, { state: "live" }, content, options);
    expect(nonPlayerIds(outOfOrder)).toEqual(["new"]);
    expect(outOfOrder.rows.find((row) => row.id === "new")?.gapSeconds).toBe(7.5);
  });

  it("clamps a backwards injected clock instead of advancing the hold", () => {
    const base = goldenFrame(44);
    const state = createRelativeViewModelState();
    const content = { ...CONTENT, rangeAhead: 1, rangeBehind: 0 };
    let nowMs = 100;
    const options = { state, nowMs: () => nowMs };
    buildRelativeViewModelV2(relativeScenarioFrame(base, 620, ["new", "old"], [], true), { state: "live" }, content, options);
    nowMs = 200;
    const changed = relativeScenarioFrame(base, 621, ["old", "new"], [], true);
    buildRelativeViewModelV2(changed, { state: "live" }, content, options);
    nowMs = 50;
    expect(nonPlayerIds(buildRelativeViewModelV2({ ...changed, sequence: 622 }, { state: "live" }, content, options))).toEqual(["old"]);
    nowMs = 1_099;
    expect(nonPlayerIds(buildRelativeViewModelV2({ ...changed, sequence: 623 }, { state: "live" }, content, options))).toEqual(["old"]);
    nowMs = 1_100;
    expect(nonPlayerIds(buildRelativeViewModelV2({ ...changed, sequence: 624 }, { state: "live" }, content, options))).toEqual(["new"]);
  });

  it("holds a marginal same-side reorder but keeps every row field current", () => {
    const base = goldenFrame(44);
    const state = createRelativeViewModelState();
    const content = { ...CONTENT, rangeAhead: 2, rangeBehind: 0 };
    let nowMs = 0;
    const options = { state, nowMs: () => nowMs };
    const initial = relativeScenarioFrame(base, 650, ["far", "near"], [], true);
    buildRelativeViewModelV2(initial, { state: "live" }, content, options);
    nowMs = 100;
    const reordered = relativeScenarioFrame(base, 651, ["near", "far"], [], true, { far: 8.5 }, { far: 101, near: 102 });
    const model = buildRelativeViewModelV2(reordered, { state: "live" }, content, options);

    expect(nonPlayerIds(model)).toEqual(["far", "near"]);
    expect(model.rows.find((row) => row.id === "far")?.gapSeconds).toBe(8.5);
  });

  it.each(["session", "epoch", "profile", "widget", "source"] as const)("resets membership on $case reset", (resetCase) => {
    const base = goldenFrame(44);
    const state = createRelativeViewModelState();
    const content = { ...CONTENT, rangeAhead: 1, rangeBehind: 0 };
    const instanceKeyA = "profile-a:widget-a";
    const instanceKeyB = resetCase === "profile" ? "profile-b:widget-a"
      : resetCase === "widget" ? "profile-a:widget-b"
        : instanceKeyA;
    let nowMs = 0;
    const old = relativeScenarioFrame(base, 700, ["new", "old"], [], true);
    buildRelativeViewModelV2(old, { state: "live" }, content, { state, nowMs: () => nowMs, instanceKey: instanceKeyA });
    if (resetCase === "source") {
      buildRelativeViewModelV2(old, { state: "stopped" }, content, { state, nowMs: () => nowMs, instanceKey: instanceKeyA });
    }
    nowMs = 1;
    const changedBase = relativeScenarioFrame(base, 701, ["old", "new"], [], true);
    const changed = {
      ...changedBase,
      sessionId: resetCase === "session" ? `${base.sessionId}-next` : base.sessionId,
      epoch: resetCase === "epoch" ? base.epoch + 1 : base.epoch,
      generatedAt: base.generatedAt,
    };
    const model = buildRelativeViewModelV2(changed, { state: "live" }, content, { state, nowMs: () => nowMs, instanceKey: instanceKeyB });
    expect(nonPlayerIds(model)).toEqual(["new"]);
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

function relativeScenarioFrame(
  base: OverlayFrameV2,
  sequence: number,
  aheadFarToNear: readonly string[],
  behindNearToFar: readonly string[],
  playerInPit: boolean,
  gaps: Readonly<Record<string, number>> = {},
  groundXById: Readonly<Record<string, number>> = {},
): OverlayFrameV2 {
  const playerId = base.player.id;
  const makeRow = (id: string, side: "ahead" | "behind", index: number) => ({
    id,
    position: index + 1,
    gap: { q: "fresh" as const, v: gaps[id] ?? (side === "ahead" ? index + 1 : -(index + 1)) },
    groundPosition: { q: "fresh" as const, v: { x: groundXById[id] ?? 1000 + index * 10, z: 0 } },
    lastLap: { q: "fresh" as const, v: 90 + index },
    side,
    authority: "derived" as const,
    name: id,
    classId: "HYPERCAR",
  });
  return {
    ...base,
    sequence,
    standings: base.standings.map((row) => row.id === playerId
      ? { ...row, pit: playerInPit ? "pit" : "track" }
      : row),
    relative: [
      ...aheadFarToNear.map((id, index) => makeRow(id, "ahead", index)),
      { id: playerId, position: 99, gap: { q: "fresh", v: 0 }, groundPosition: { q: "fresh", v: { x: 950, z: 0 } }, lastLap: { q: "fresh", v: 89 }, side: "player", authority: "derived", name: "player", classId: "HYPERCAR" },
      ...behindNearToFar.map((id, index) => makeRow(id, "behind", index)),
    ] as OverlayFrameV2["relative"],
  };
}

function nonPlayerIds(model: ReturnType<typeof buildRelativeViewModelV2>): string[] {
  return model.rows.filter((row) => !row.isPlayer).map((row) => row.id);
}
