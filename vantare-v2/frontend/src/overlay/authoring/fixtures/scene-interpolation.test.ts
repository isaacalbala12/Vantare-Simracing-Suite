import { describe, expect, it } from "vitest";
import type { AnimationScene } from "./animation-scenes";
import { interpolateSceneAt, sceneDurationMs } from "./scene-interpolation";

const scene: AnimationScene = {
  id: "test",
  widget: "standings",
  label: "Test",
  watchFor: "-",
  frameMs: 1000,
  frames: [
    { caption: "inicio", cars: { A: { timeBehindLeader: 10, place: 9, inPits: false } } },
    { caption: "medio", cars: { A: { timeBehindLeader: 20, place: 9, inPits: false } } },
    { caption: "fin", cars: { A: { timeBehindLeader: 20, place: 8, inPits: true } } },
  ],
};

const gapAt = (ms: number, loop = false) =>
  interpolateSceneAt(scene, ms, loop).frame.cars?.A?.timeBehindLeader;

describe("scene interpolation", () => {
  it("holds the first keyframe at the start", () => {
    expect(gapAt(0)).toBe(10);
  });

  it("moves continuously between keyframes instead of stepping", () => {
    const quarter = gapAt(250)!;
    const half = gapAt(500)!;
    const threeQuarters = gapAt(750)!;
    expect(half).toBeCloseTo(15, 5);
    expect(quarter).toBeGreaterThan(10);
    expect(quarter).toBeLessThan(half);
    expect(threeQuarters).toBeGreaterThan(half);
    expect(threeQuarters).toBeLessThan(20);
  });

  it("eases rather than running at constant velocity", () => {
    // With easing the first quarter covers less ground than the middle quarter.
    const firstQuarter = gapAt(250)! - gapAt(0)!;
    const secondQuarter = gapAt(500)! - gapAt(250)!;
    expect(firstQuarter).toBeLessThan(secondQuarter);
  });

  it("lands exactly on each keyframe", () => {
    expect(gapAt(1000)).toBeCloseTo(20, 5);
    expect(gapAt(2000)).toBe(20);
  });

  it("snaps discrete facts instead of blending them", () => {
    // Position and pit state are never half-way between two values.
    for (const ms of [1100, 1500, 1900]) {
      const car = interpolateSceneAt(scene, ms, false).frame.cars?.A;
      expect([8, 9]).toContain(car?.place);
      expect(typeof car?.inPits).toBe("boolean");
    }
  });

  // The bug this guards: taking discrete facts from the keyframe being
  // approached made the swap happen at the START of the approach, so cars
  // changed places and only then did the gap close.
  it("holds a discrete fact until the playhead reaches the keyframe that changes it", () => {
    for (const ms of [1000, 1200, 1600, 1999]) {
      expect(interpolateSceneAt(scene, ms, false).frame.cars?.A?.place, `at ${ms}ms`).toBe(9);
      expect(interpolateSceneAt(scene, ms, false).frame.cars?.A?.inPits, `at ${ms}ms`).toBe(false);
    }
    expect(interpolateSceneAt(scene, 2000, false).frame.cars?.A?.place).toBe(8);
    expect(interpolateSceneAt(scene, 2000, false).frame.cars?.A?.inPits).toBe(true);
  });

  it("closes the gap before the places change, not after", () => {
    const swapAt = 2000;
    const gapJustBefore = gapAt(swapAt - 1)!;
    const placeJustBefore = interpolateSceneAt(scene, swapAt - 1, false).frame.cars?.A?.place;
    expect(gapJustBefore).toBeCloseTo(20, 1);
    expect(placeJustBefore).toBe(9);
  });

  it("stops on the last keyframe when not looping", () => {
    const end = interpolateSceneAt(scene, 99_999, false);
    expect(end.keyframe).toBe(2);
    expect(end.frame.cars?.A?.place).toBe(8);
  });

  it("wraps back round when looping", () => {
    const cycle = scene.frameMs * scene.frames.length;
    expect(interpolateSceneAt(scene, cycle, true).keyframe).toBe(0);
    expect(interpolateSceneAt(scene, cycle + 500, true).keyframe).toBeLessThan(2);
  });

  it("reports the keyframe being approached, so the caption leads the motion", () => {
    expect(interpolateSceneAt(scene, 100, false).frame.caption).toBe("inicio");
    expect(interpolateSceneAt(scene, 900, false).frame.caption).toBe("medio");
  });

  it("states how long one pass takes", () => {
    expect(sceneDurationMs(scene)).toBe(2000);
  });

  it("interpolates the session clock and the player's own values", () => {
    const clockScene: AnimationScene = {
      ...scene,
      frames: [
        { caption: "a", remainingSeconds: 600, player: { brake: 0, deltaSeconds: 0.4 } },
        { caption: "b", remainingSeconds: 300, player: { brake: 1, deltaSeconds: -0.4 } },
      ],
    };
    const mid = interpolateSceneAt(clockScene, 500, false).frame;
    expect(mid.remainingSeconds).toBeCloseTo(450, 5);
    expect(mid.player?.brake).toBeCloseTo(0.5, 5);
    expect(mid.player?.deltaSeconds).toBeCloseTo(0, 5);
  });
});
