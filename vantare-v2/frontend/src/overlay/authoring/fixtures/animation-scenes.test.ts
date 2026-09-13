import { describe, expect, it } from "vitest";
import {
  ANIMATION_SCENES,
  getAnimationScene,
  listAnimationScenes,
  sceneFrameAt,
} from "./animation-scenes";
import { buildWorkshopFrameV2, createScenarioWidget, type WorkshopV2Scenario } from "./authoring-v2-workshop-frame";
import { buildStandingsViewModelV2 } from "../../widget-types/standings/standings-view-model-v2";
import { parseStandingsContent } from "../../widget-types/standings/standings-content";
import { deriveStandingsEvents, deriveBattlePairs } from "../../design-systems/vantare-endurance/standings/standings-motion";
import { deriveRelativeEvents } from "../../design-systems/vantare-endurance/relative/relative-motion";
import { buildRelativeViewModelV2 } from "../../widget-types/relative/relative-view-model-v2";
import { parseRelativeContent } from "../../widget-types/relative/relative-content";
import { projectionGapsFor } from "./projection-gaps";

function scenario(widget: "standings" | "relative", sceneId: string, sceneFrame: number): WorkshopV2Scenario {
  return {
    session: "race",
    location: "track",
    state: "ready",
    widget,
    system: "vantare-endurance",
    variant: "default",
    sceneId,
    sceneFrame,
  };
}

function relativeModelAt(sceneId: string, frame: number) {
  const input = scenario("relative", sceneId, frame);
  const runtime = buildWorkshopFrameV2(input);
  const widget = createScenarioWidget(input);
  return buildRelativeViewModelV2(
    runtime.overlayV2Frame!, runtime.overlayV2Source!, parseRelativeContent(widget.content),
  );
}

function modelAt(sceneId: string, frame: number) {
  const input = scenario("standings", sceneId, frame);
  const runtime = buildWorkshopFrameV2(input);
  const widget = createScenarioWidget(input);
  return buildStandingsViewModelV2(
    runtime.overlayV2Frame!, runtime.overlayV2Source!, parseStandingsContent(widget.content),
  );
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

  it("only flags gaps declared by the V2 presentation contract", () => {
    for (const scene of ANIMATION_SCENES) {
      if (scene.unsupportedSignal) {
        expect(
          projectionGapsFor(scene.widget).map((gap) => gap.field),
          `${scene.id} flags a signal the V2 presentation contract does not list`,
        ).toContain(
          scene.unsupportedSignal,
        );
      }
    }
  });

  it("warns that the tire disc never fires against live telemetry", () => {
    expect(getAnimationScene("standings-tire-change")?.unsupportedSignal).toBe(
      "rows[].tireCompound",
    );
    expect(getAnimationScene("standings-full")?.unsupportedSignal).toBe("rows[].tireCompound");
    expect(getAnimationScene("delta-new-best")?.unsupportedSignal).toBe("bestLapText");
    const deltaCaptions = getAnimationScene("delta-new-best")?.frames.map((frame) => frame.caption) ?? [];
    expect(deltaCaptions.every((caption) => /no disponible|placeholder/.test(caption))).toBe(true);
    expect(deltaCaptions.join(" ")).not.toMatch(/\d+:\d+|barrido/i);
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

  it("full sequence also transfers the session-best crown from an explicit holder", () => {
    const events = deriveStandingsEvents(modelAt("standings-full", 6), modelAt("standings-full", 7));
    const best = events.find((event) => event.kind === "session-best");
    expect(best).toBeDefined();
    if (best?.kind === "session-best") {
      expect(best.previousRowId).not.toBeNull();
      expect(best.previousRowId).not.toBe(best.rowId);
    }
  });

  it("tire change reports pit-out but does not invent the unavailable compound", () => {
    const events = deriveStandingsEvents(modelAt("standings-tire-change", 2), modelAt("standings-tire-change", 3));
    const pitOut = events.find((event) => event.kind === "pit-out");
    expect(pitOut).toBeDefined();
    if (pitOut?.kind === "pit-out") {
      expect(pitOut.tireCompound).toBe("");
      expect(pitOut.tireChanged).toBe(false);
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
    const targetId = before.rows.find((row) => row.position === 10)?.id;
    expect(targetId).toBeDefined();
    const find = (model: typeof before) => model.rows.findIndex((row) => row.id === targetId);
    expect(find(before) - find(after)).toBeGreaterThanOrEqual(2);
  });
});
