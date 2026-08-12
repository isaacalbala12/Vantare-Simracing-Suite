import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ANIMATION_SCENES,
  getAnimationScene,
  listAnimationScenes,
  sceneFrameAt,
} from "./animation-scenes";
import { buildAuthoringFixtureTelemetry, buildAuthoringFixtureWidget } from "./authoring-fixtures";
import { buildStandingsViewModel } from "../../widget-types/standings/standings-view-model";
import { parseStandingsContent } from "../../widget-types/standings/standings-content";
import { deriveStandingsEvents, deriveBattlePairs } from "../../design-systems/vantare-endurance/standings/standings-motion";
import { deriveRelativeEvents } from "../../design-systems/vantare-endurance/relative/relative-motion";
import { buildRelativeViewModel } from "../../widget-types/relative/relative-view-model";
import { parseRelativeContent } from "../../widget-types/relative/relative-content";

function relativeModelAt(sceneId: string, frame: number) {
  const scenario = {
    session: "race",
    location: "track",
    state: "ready",
    widget: "relative",
    system: "vantare-endurance",
    surface: "obs",
    sceneId,
    sceneFrame: frame,
  } as const;
  const widget = buildAuthoringFixtureWidget(scenario);
  const snapshot = buildAuthoringFixtureTelemetry(scenario);
  return buildRelativeViewModel(snapshot, parseRelativeContent(widget.content));
}

function modelAt(sceneId: string, frame: number) {
  const scenario = {
    session: "race",
    location: "track",
    state: "ready",
    widget: "standings",
    system: "vantare-endurance",
    surface: "obs",
    sceneId,
    sceneFrame: frame,
  } as const;
  const widget = buildAuthoringFixtureWidget(scenario);
  const snapshot = buildAuthoringFixtureTelemetry(scenario);
  return buildStandingsViewModel(snapshot, parseStandingsContent(widget.content));
}

describe("animation scene catalog", () => {
  it("gives every scene a unique id, frames and a caption per frame", () => {
    const ids = ANIMATION_SCENES.map((scene) => scene.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const scene of ANIMATION_SCENES) {
      expect(scene.frames.length, scene.id).toBeGreaterThan(1);
      expect(scene.frameMs, scene.id).toBeGreaterThan(0);
      expect(scene.watchFor.length, scene.id).toBeGreaterThan(0);
      for (const frame of scene.frames) {
        expect(frame.caption.trim(), scene.id).not.toBe("");
      }
    }
  });

  it("wraps frame lookups in both directions so the transport can loop", () => {
    const scene = getAnimationScene("standings-overtake")!;
    expect(sceneFrameAt(scene, scene.frames.length)).toBe(scene.frames[0]);
    expect(sceneFrameAt(scene, -1)).toBe(scene.frames[scene.frames.length - 1]);
  });

  it("lists only the scenes belonging to a widget", () => {
    for (const scene of listAnimationScenes("standings")) {
      expect(scene.widget).toBe("standings");
    }
  });

  // If the projection starts delivering one of these, the warning becomes a
  // lie. Reading the adapter's own list keeps the two from drifting apart.
  it("only flags signals the projection actually declares unsupported", () => {
    const adapter = readFileSync(
      join(process.cwd(), "src/overlay/projection/overlay-projection-adapter.ts"),
      "utf8",
    );
    const declared = [...adapter.matchAll(/targetPath: "([^"]+)"/g)].map((match) => match[1]);
    expect(declared.length).toBeGreaterThan(0);
    for (const scene of ANIMATION_SCENES) {
      if (scene.unsupportedSignal) {
        expect(declared, `${scene.id} flags a signal the adapter does not list`).toContain(
          scene.unsupportedSignal,
        );
      }
    }
  });

  it("warns that the tire disc never fires against live telemetry", () => {
    expect(getAnimationScene("standings-tire-change")?.unsupportedSignal).toBe(
      "scoring[].tireCompound",
    );
  });
});

describe("scenes drive the motion engine", () => {
  it("overtake swaps two cars, which is what the engine reports", () => {
    const before = modelAt("standings-overtake", 1);
    const after = modelAt("standings-overtake", 2);
    const events = deriveStandingsEvents(before, after);
    expect(events.some((event) => event.kind === "overtake")).toBe(true);
  });

  it("battle closes the gap under the threshold and then breaks it", () => {
    expect(deriveBattlePairs(modelAt("standings-battle", 0))).toHaveLength(0);
    expect(deriveBattlePairs(modelAt("standings-battle", 2)).length).toBeGreaterThan(0);
    expect(deriveBattlePairs(modelAt("standings-battle", 5))).toHaveLength(0);
  });

  it("fastest lap changes hands, so the crown has somewhere to fly", () => {
    const events = deriveStandingsEvents(modelAt("standings-fastest-lap", 0), modelAt("standings-fastest-lap", 1));
    const best = events.find((event) => event.kind === "session-best");
    expect(best).toBeDefined();
    if (best?.kind === "session-best") {
      expect(best.previousRowId).not.toBeNull();
      expect(best.previousRowId).not.toBe(best.rowId);
    }
  });

  it("tire change reports the compound coming out of the pits", () => {
    const events = deriveStandingsEvents(modelAt("standings-tire-change", 2), modelAt("standings-tire-change", 3));
    const pitOut = events.find((event) => event.kind === "pit-out");
    expect(pitOut).toBeDefined();
    if (pitOut?.kind === "pit-out") {
      expect(pitOut.tireCompound).toBe("S");
      expect(pitOut.tireChanged).toBe(true);
    }
  });

  it("retirement removes a car and the entry scene brings one back", () => {
    const running = modelAt("standings-retirement", 0);
    const retired = modelAt("standings-retirement", 1);
    expect(retired.rows.length).toBe(running.rows.length - 1);

    const missing = modelAt("standings-car-enters", 0);
    const present = modelAt("standings-car-enters", 1);
    expect(present.rows.length).toBe(missing.rows.length + 1);
  });

  it("final minutes drops the session clock under five minutes", () => {
    expect(modelAt("standings-final-minutes", 0).remainingText).toBe("12:00");
    expect(modelAt("standings-final-minutes", 2).remainingText).toBe("04:40");
  });

  it("relative cross scene moves a rival from one side of the player to the other", () => {
    const before = relativeModelAt("relative-cross", 0);
    const after = relativeModelAt("relative-cross", 1);
    const events = deriveRelativeEvents(before, after);
    expect(events).toContainEqual({
      kind: "cross",
      rowId: events.find((event) => event.kind === "cross")!.rowId,
      to: "ahead",
    });
  });

  it("relative enter scene brings a car into the visible window", () => {
    const before = relativeModelAt("relative-enter", 0);
    const after = relativeModelAt("relative-enter", 1);
    expect(deriveRelativeEvents(before, after).some((event) => event.kind === "enter")).toBe(true);
  });

  it("delta chip scene moves a car several places at once", () => {
    const before = modelAt("standings-delta-chip", 0);
    const after = modelAt("standings-delta-chip", 1);
    const find = (model: typeof before) =>
      model.rows.findIndex((row) => row.driverName.includes("Bruni"));
    expect(find(before) - find(after)).toBeGreaterThanOrEqual(2);
  });
});
