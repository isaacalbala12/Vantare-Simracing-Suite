import { describe, expect, it, vi } from "vitest";
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
import { groupRowsByClass } from "../../design-systems/vantare-endurance/standings/standings-endurance-shared";
import { deriveRelativeEvents } from "../../design-systems/vantare-endurance/relative/relative-motion";
import { buildRelativeViewModelV2, relativeDisplayedValues } from "../../widget-types/relative/relative-view-model-v2";
import { parseRelativeContent } from "../../widget-types/relative/relative-content";
import { broadcastTowerDefinition } from "../../widget-types/broadcast-tower/broadcast-tower-definition";
import { buildBroadcastTowerViewModelV2 } from "../../widget-types/broadcast-tower/broadcast-tower-view-model-v2";
import { parseOverlayWorkshopQuery } from "../overlay-workshop-query";
import { projectionGapsFor } from "./projection-gaps";
import { relativeStructureKey } from "../../design-systems/vantare-functional/relative-presentation";

function scenario(
  widget: "standings" | "relative",
  sceneId: string,
  sceneFrame: number,
  system: WorkshopV2Scenario["system"] = "vantare-endurance",
): WorkshopV2Scenario {
  return {
    session: "race",
    location: "track",
    state: "ready",
    widget,
    system,
    variant: "default",
    sceneId,
    sceneFrame,
  };
}

function functionalRelativeFrame(sceneId: string, sceneFrame: number) {
  return buildWorkshopFrameV2(
    scenario("relative", sceneId, sceneFrame, "vantare-functional"),
  ).overlayV2Frame!;
}

function functionalRelativeModel(sceneId: string, sceneFrame: number, session: WorkshopV2Scenario["session"] = "race") {
  const input = { ...scenario("relative", sceneId, sceneFrame, "vantare-functional"), session };
  const runtime = buildWorkshopFrameV2(input);
  const widget = createScenarioWidget(input);
  return buildRelativeViewModelV2(runtime.overlayV2Frame!, runtime.overlayV2Source!, parseRelativeContent(widget.content));
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

function towerModelAt(sceneId: string, frame: number, session: "practice" | "qualifying" | "race" = "race") {
  const input: WorkshopV2Scenario = {
    session,
    location: "track",
    state: "ready",
    widget: "broadcast-tower",
    system: "vantare-functional",
    variant: "default",
    sceneId,
    sceneFrame: frame,
  };
  const runtime = buildWorkshopFrameV2(input);
  const widget = createScenarioWidget(input);
  return buildBroadcastTowerViewModelV2(
    runtime.overlayV2Frame!, runtime.overlayV2Source!, broadcastTowerDefinition.parseContent(widget.content),
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

  it("does not advertise older Relative effects under Eficiencia", () => {
    const functional = listAnimationScenes("relative", "vantare-functional").map((scene) => scene.id);
    expect(functional).toContain("relative-functional-sequence");
    expect(functional).not.toContain("relative-cross");
    expect(functional).not.toContain("relative-enter");
    expect(listAnimationScenes("relative", "vantare-endurance").map((scene) => scene.id)).toContain("relative-enter");
  });

  it("Functional Relative captions and visible drivers use the real grid names in every session", () => {
    const sceneIds = [
      "relative-functional-cross-ahead", "relative-functional-cross-behind",
      "relative-functional-window-cycle", "relative-functional-fast-reversal",
      "relative-functional-stable-values", "relative-functional-sequence", "relative-functional-lap-difference",
    ];
    for (const session of ["practice", "qualifying", "race"] as const) {
      for (const sceneId of sceneIds) {
        const scene = getAnimationScene(sceneId)!;
        expect(scene.frames.some((frame) => Object.keys(frame.cars ?? {}).some((name) => frame.caption.includes(name)))).toBe(true);
        expect(`${scene.watchFor} ${scene.frames.map((frame) => frame.caption).join(" ")}`).not.toMatch(/Bruni|Birch/);
        scene.frames.forEach((frame, index) => {
          const visibleNames = functionalRelativeModel(sceneId, index, session).rows.map((row) => row.driverName);
          for (const [name, patch] of Object.entries(frame.cars ?? {})) {
            expect(["Nico Pino", "Mikkel Jensen", "Antonio Giovinazzi", "Kévin Estre", "Ben Hanley", "Maro Engel", "André Lotterer"]).toContain(name);
            expect(visibleNames.includes(name), `${session} ${sceneId} frame ${index}: ${name}; visible=${visibleNames.join(", ")}`)
              .toBe(patch.absent !== true);
          }
        });
      }
    }

  it("filters Horizontal Standings scenes to the Functional design system", () => {
    const ids = listAnimationScenes("broadcast-tower", "vantare-functional").map((scene) => scene.id);
    expect(ids).toEqual([
      "broadcast-tower-overtake-sequence",
      "broadcast-tower-crossing",
      "broadcast-tower-fast-inversion",
      "broadcast-tower-exit-reentry",
      "broadcast-tower-stable-values",
    ]);
    expect(listAnimationScenes("broadcast-tower", "vantare-original")).toEqual([]);
    expect(listAnimationScenes("standings").some((scene) => scene.id === "standings-overtake")).toBe(true);
    expect(parseOverlayWorkshopQuery("?widget=broadcast-tower&system=vantare-functional&scene=broadcast-tower-crossing")).toMatchObject({
      widget: "broadcast-tower", system: "vantare-functional", sceneId: "broadcast-tower-crossing",
    });
    expect(parseOverlayWorkshopQuery("?widget=broadcast-tower&system=vantare-original&scene=broadcast-tower-crossing")).toEqual({
      error: "scene broadcast-tower-crossing requires system=vantare-functional",
    });
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

  it("warns only for signals that still cannot fire against live telemetry", () => {
    expect(getAnimationScene("standings-tire-change")?.unsupportedSignal).toBe(
      "rows[].tireCompound",
    );
    expect(getAnimationScene("standings-full")?.unsupportedSignal).toBe("rows[].tireCompound");
    expect(getAnimationScene("delta-new-best")?.unsupportedSignal).toBeUndefined();
    const deltaCaptions = getAnimationScene("delta-new-best")?.frames.map((frame) => frame.caption) ?? [];
    expect(deltaCaptions.join(" ")).toMatch(/personal|aviso/i);
    expect(deltaCaptions.join(" ")).not.toMatch(/no disponible|placeholder/i);
  });
});

describe("scenes drive the motion engine", () => {
  it("shows the full tower position sequence in practice, qualifying, and race", () => {
    for (const session of ["practice", "qualifying", "race"] as const) {
      const start = towerModelAt("broadcast-tower-overtake-sequence", 0, session);
      const crossed = towerModelAt("broadcast-tower-overtake-sequence", 1, session);
      const final = towerModelAt("broadcast-tower-overtake-sequence", 6, session);
      expect(start.sessionLabel).toBe(session.toUpperCase());
      expect(start.rows).toHaveLength(10);
      expect(start.rows.slice(0, 6).map((row) => row.name)).toEqual([
        "André Lotterer", "Ben Hanley", "Kévin Estre", "Antonio Giovinazzi", "Filipe Albuquerque", "Alessandro Pier Guidi",
      ]);
      expect(start.rows.find((row) => row.place === 2)?.name).toBe("Ben Hanley");
      expect(crossed.rows.find((row) => row.place === 2)?.name).toBe("Filipe Albuquerque");
      expect(crossed.rows.find((row) => row.place === 5)?.name).toBe("Ben Hanley");
      expect(final.rows.find((row) => row.place === 2)?.name).toBe("Ben Hanley");
      expect(final.rows.find((row) => row.place === 5)?.name).toBe("Filipe Albuquerque");
    }
  });

  it("covers a single crossing, a fast reversal, exit/reentry, and changing numbers without reordering", () => {
    const crossingBefore = towerModelAt("broadcast-tower-crossing", 0);
    const crossingAfter = towerModelAt("broadcast-tower-crossing", 1);
    expect(crossingBefore.rows.find((row) => row.place === 2)?.name).toBe("Ben Hanley");
    expect(crossingAfter.rows.find((row) => row.place === 2)?.name).toBe("Filipe Albuquerque");
    expect(towerModelAt("broadcast-tower-fast-inversion", 1).rows.find((row) => row.place === 2)?.name).toBe("Filipe Albuquerque");
    expect(towerModelAt("broadcast-tower-fast-inversion", 2).rows.find((row) => row.place === 2)?.name).toBe("Ben Hanley");

    const present = towerModelAt("broadcast-tower-exit-reentry", 0);
    const absent = towerModelAt("broadcast-tower-exit-reentry", 1);
    const reentered = towerModelAt("broadcast-tower-exit-reentry", 2);
    expect(present.rows).toHaveLength(10);
    expect(absent.rows.some((row) => row.name === "Kévin Estre")).toBe(false);
    expect(absent.rows).toHaveLength(10);
    expect(reentered.rows.find((row) => row.place === 3)?.name).toBe("Kévin Estre");

    const steady = towerModelAt("broadcast-tower-stable-values", 0);
    const updated = towerModelAt("broadcast-tower-stable-values", 1);
    expect(steady.rows.map((row) => row.name)).toEqual(updated.rows.map((row) => row.name));
    expect(steady.rows.find((row) => row.name === "Ben Hanley")?.gap).toBe(0.4);
    expect(updated.rows.find((row) => row.name === "Ben Hanley")?.gap).toBe(0.2);
  });
  it("overtake swaps two cars, which is what the engine reports", () => {
    const before = modelAt("standings-overtake", 1);
    const after = modelAt("standings-overtake", 2);
    const events = deriveStandingsEvents(before, after);
    expect(events.some((event) => event.kind === "overtake")).toBe(true);
  });

  it("class battle closes inside a visible class block, then the overtake swaps the rows in place", () => {
    // Frame 2: Birch (GTE P9) a 0,3 s de Pier Guidi (GTE P6) — la pareja existe
    // dentro del bloque que Redline sí recorta visible (la clase del jugador,
    // hypercar, queda fuera del presupuesto de filas).
    const closing = modelAt("standings-class-battle", 2);
    expect(deriveBattlePairs(closing).length).toBeGreaterThan(0);
    const gteBefore = groupRowsByClass(closing.rows).find((group) => group.vehicleClass === "gte")?.rows ?? [];
    const aheadIdx = gteBefore.findIndex((row) => row.driverName === "Alessandro Pier Guidi");
    const behindIdx = gteBefore.findIndex((row) => row.driverName === "Michael Birch");
    expect(aheadIdx).toBeGreaterThanOrEqual(0);
    expect(behindIdx).toBe(aheadIdx + 1);

    // Frame 4: el adelantamiento intercambia las filas dentro de la misma
    // clase — el reorder visible que la parrilla multiclase no daba hasta ahora.
    const swapped = modelAt("standings-class-battle", 4);
    const gteAfter = groupRowsByClass(swapped.rows).find((group) => group.vehicleClass === "gte")?.rows ?? [];
    expect(gteAfter.findIndex((row) => row.driverName === "Alessandro Pier Guidi")).toBe(behindIdx);
    expect(gteAfter.findIndex((row) => row.driverName === "Michael Birch")).toBe(aheadIdx);
    expect(deriveStandingsEvents(closing, swapped).some((event) => event.kind === "overtake")).toBe(true);
  });

  it("warns once per scene and driver when a patch resolves no row", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const input: WorkshopV2Scenario = {
        ...scenario("standings", "standings-overtake", 0),
        sceneState: { caption: "x", cars: { "Piloto Inexistente": { place: 1 } } },
      };
      buildWorkshopFrameV2(input);
      buildWorkshopFrameV2(input);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0]?.[0])).toContain("Piloto Inexistente");
    } finally {
      warn.mockRestore();
    }
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

  it.each([
    ["relative-functional-cross-ahead", "behind", "ahead"],
    ["relative-functional-cross-behind", "ahead", "behind"],
  ] as const)("Functional Relative %s crosses the same row in both sections", (sceneId, from, to) => {
    const scene = getAnimationScene(sceneId)!;
    expect(listAnimationScenes("relative")).toContain(scene);

    const before = functionalRelativeFrame(sceneId, 0);
    const after = functionalRelativeFrame(sceneId, 2);
    expect(after.player.id).toBe(before.player.id);

    for (const section of ["relative", "relativeSettled"] as const) {
      const priorRow = before[section].find((row) => row.position === 20)!;
      const nextRow = after[section].find((row) => row.id === priorRow.id)!;
      expect(priorRow.id).toBeDefined();
      expect(priorRow.side).toBe(from);
      expect(nextRow.side).toBe(to);
      expect(priorRow.gap.v).toBe(from === "ahead" ? 0.65 : -0.65);
      expect(nextRow.gap.v).toBe(to === "ahead" ? 0.12 : -0.12);
      const priorIndex = before[section].findIndex((row) => row.id === priorRow.id);
      const nextIndex = after[section].findIndex((row) => row.id === priorRow.id);
      const playerIndex = before[section].findIndex((row) => row.id === before.player.id);
      const nextPlayerIndex = after[section].findIndex((row) => row.id === after.player.id);
      expect(from === "ahead" ? priorIndex < playerIndex : priorIndex > playerIndex).toBe(true);
      expect(to === "ahead" ? nextIndex < nextPlayerIndex : nextIndex > nextPlayerIndex).toBe(true);
    }
    const visibleBefore = functionalRelativeModel(sceneId, 0);
    const visibleAfter = functionalRelativeModel(sceneId, 2);
    expect(visibleBefore.rows.find((row) => row.position === 20)?.side).toBe(from);
    expect(visibleAfter.rows.find((row) => row.position === 20)?.side).toBe(to);
  });

  it("Functional Relative window scene exits and re-enters the same row without moving the player", () => {
    const frames = [0, 1, 3, 5, 6].map((frame) => functionalRelativeFrame("relative-functional-window-cycle", frame));
    const playerId = frames[0]!.player.id;
    const birchAt = (frame: (typeof frames)[number]) => frame.relative.find((row) => row.position === 19);
    const entered = birchAt(frames[1]!);
    const reentered = birchAt(frames[3]!);

    expect(birchAt(frames[0]!)).toBeUndefined();
    expect(entered).toBeDefined();
    expect(birchAt(frames[2]!)).toBeUndefined();
    expect(reentered?.id).toBe(entered?.id);
    expect(birchAt(frames[4]!)?.id).toBe(entered?.id);
    expect(frames.every((frame) => frame.player.id === playerId)).toBe(true);
    const visible = [0, 1, 3, 5, 6].map((frame) => functionalRelativeModel("relative-functional-window-cycle", frame));
    expect(visible.map((current) => current.rows.some((row) => row.position === 19))).toEqual([false, true, false, true, true]);
    expect(new Set(visible.map((current) => current.rows.find((row) => row.isPlayer)?.id)).size).toBe(1);
  });

  it("Functional Relative fast reversal keeps one rival and flips sides every 180 ms", () => {
    const scene = getAnimationScene("relative-functional-fast-reversal")!;
    expect(scene.frameMs).toBe(180);
    expect(scene.frameMs).toBeLessThan(300);
    const frames = scene.frames.map((_, index) => functionalRelativeFrame(scene.id, index));
    const rows = frames.map((frame) => frame.relative.find((row) => row.position === 20)!);
    expect(new Set(rows.map((row) => row.id)).size).toBe(1);
    expect(frames.every((frame) => frame.player.id === frames[0]!.player.id)).toBe(true);
    expect(rows.map((row) => row.side)).toEqual(["behind", "ahead", "behind", "ahead"]);
    expect(rows.map((row) => row.gap.v)).toEqual([-0.14, 0.14, -0.14, 0.14]);
    expect(scene.frames.map((_, index) => functionalRelativeModel(scene.id, index).rows.find((row) => row.position === 20)?.side))
      .toEqual(["behind", "ahead", "behind", "ahead"]);
  });

  it("Functional Relative stable sample changes numbers without changing visible identities", () => {
    const scene = getAnimationScene("relative-functional-stable-values")!;
    const frames = scene.frames.map((_, index) => functionalRelativeFrame(scene.id, index));
    const sample = (frame: (typeof frames)[number]) => frame.relative.map((row) => [row.id, row.gap.v]);
    expect(frames.slice(1).every((frame) => frame.player.id === frames[0]!.player.id)).toBe(true);
    expect(sample(frames[1]!)).not.toEqual(sample(frames[0]!));
    expect(sample(frames[2]!)).not.toEqual(sample(frames[1]!));
    const visible = scene.frames.map((_, index) => functionalRelativeModel(scene.id, index).rows);
    expect(visible[1]?.map((row) => row.id)).toEqual(visible[0]?.map((row) => row.id));
    expect(visible[2]?.map((row) => row.id)).toEqual(visible[0]?.map((row) => row.id));
    expect(visible[1]?.map((row) => row.gapText)).not.toEqual(visible[0]?.map((row) => row.gapText));
  });

  it("Functional Relative combined scene is available for complete review", () => {
    const scene = getAnimationScene("relative-functional-sequence")!;
    expect(scene.label).toBe("Secuencia completa");
    expect(scene.watchFor).toMatch(/Reproducir.*deslizador/i);
    const frames = scene.frames.map((_, index) => functionalRelativeFrame(scene.id, index));
    const bruniAt = (frame: (typeof frames)[number]) => frame.relative.find((row) => row.position === 20)!;
    const birchAt = (frame: (typeof frames)[number]) => frame.relative.find((row) => row.position === 19);

    expect(bruniAt(frames[0]!).side).toBe("behind");
    expect(bruniAt(frames[2]!).side).toBe("ahead");
    expect(birchAt(frames[0]!)).toBeUndefined();
    expect(birchAt(frames[2]!)).toBeDefined();
    expect(birchAt(frames[4]!)).toBeUndefined();
    expect(birchAt(frames[5]!)?.id).toBe(birchAt(frames[2]!)?.id);
    expect(bruniAt(frames[7]!).side).toBe("behind");
    expect(frames.every((frame) => frame.player.id === frames[0]!.player.id)).toBe(true);
    for (const index of [0, 2, 4, 5, 7]) {
      const visible = functionalRelativeModel(scene.id, index).rows;
      expect(visible.some((row) => row.position === 20)).toBe(true);
      expect(visible.some((row) => row.position === 19)).toBe(index === 2 || index === 5 || index === 7);
    }
  });

  it("keeps race lap differences explicit, localized by the renderer, and outside row structure", () => {
    const defaultInput = {
      ...scenario("relative", "relative-functional-lap-difference", 0, "vantare-functional"),
      sceneId: undefined,
    };
    const baseRuntime = buildWorkshopFrameV2(defaultInput);
    const baseFrame = baseRuntime.overlayV2Frame!;
    const baseWidget = createScenarioWidget(defaultInput);
    const baseContent = parseRelativeContent(baseWidget.content);
    const raceDefault = buildRelativeViewModelV2(
      baseFrame, baseRuntime.overlayV2Source!, baseContent,
    );
    const defaultGiovinazzi = raceDefault.rows.find((row) => row.driverName === "Antonio Giovinazzi");
    expect(defaultGiovinazzi).toMatchObject({ position: 4, side: "ahead", lapDelta: -1 });
    expect(raceDefault.rows.filter((row) => row.isPlayer)).toHaveLength(1);

    const scene = getAnimationScene("relative-functional-lap-difference")!;
    expect(listAnimationScenes("relative", "vantare-functional")).toContain(scene);
    expect(scene.watchFor).toMatch(/solo de carrera/i);
    const sceneFrames = scene.frames.map((_, index) => functionalRelativeFrame(scene.id, index));
    expect(sceneFrames.every((frame) => frame.relative.length === sceneFrames[0]!.relative.length)).toBe(true);
    expect(sceneFrames.every((frame) => frame.relative.some((row) => row.id === baseFrame.player.id))).toBe(true);
    const rowsAt = (index: number) => sceneFrames[index]!.relative;
    const lapAt = (index: number, name: string) => rowsAt(index).find((row) => row.name === name)!.lapDelta;
    expect(lapAt(0, "Antonio Giovinazzi")).toEqual({ q: "fresh", v: 1 });
    expect(lapAt(0, "Kévin Estre")).toEqual({ q: "fresh", v: 1 });
    expect(lapAt(0, "Ben Hanley")).toEqual({ q: "fresh", v: 2 });
    expect(lapAt(0, "Mikkel Jensen")).toEqual({ q: "fresh", v: -1 });
    expect(lapAt(0, "Nico Pino")).toEqual({ q: "fresh", v: -2 });
    expect(lapAt(0, "Maro Engel")).toEqual({ q: "fresh", v: 0 });
    expect(lapAt(1, "Maro Engel")).toEqual({ q: "missing" });

    const firstModel = functionalRelativeModel(scene.id, 0);
    const secondModel = functionalRelativeModel(scene.id, 1);
    expect(firstModel.rows.filter((row) => !row.isPlayer)).toHaveLength(6);
    expect(firstModel.rows.find((row) => row.isPlayer)).toMatchObject({ driverName: "André Lotterer", position: 10 });
    expect(firstModel.playerBadgeText).toMatch(/^P10\b/);
    const standingsAt = (name: string) => sceneFrames[0]!.standings.find((row) => row.driver === name)?.position;
    expect(standingsAt("André Lotterer")).toBe(10);
    expect(standingsAt("Gianmaria Bruni")).toBe(1);
    for (const name of ["Ben Hanley", "Kévin Estre", "Antonio Giovinazzi", "Maro Engel", "Mikkel Jensen", "Nico Pino"]) {
      const relative = sceneFrames[0]!.relative.find((row) => row.name === name);
      const settled = sceneFrames[0]!.relativeSettled.find((row) => row.name === name);
      expect(settled?.position, `${name} settled position`).toBe(relative?.position);
    }
    expect(firstModel.rows.find((row) => row.driverName === "Ben Hanley")).toMatchObject({ position: 2, lapDelta: 2 });
    expect(firstModel.rows.find((row) => row.driverName === "Kévin Estre")).toMatchObject({ position: 3, lapDelta: 1 });
    expect(firstModel.rows.find((row) => row.driverName === "Antonio Giovinazzi")).toMatchObject({ position: 4, lapDelta: 1 });
    expect(firstModel.rows.find((row) => row.driverName === "Maro Engel")).toMatchObject({ position: 18, lapDelta: null });
    expect(firstModel.rows.find((row) => row.driverName === "Mikkel Jensen")).toMatchObject({ position: 19, lapDelta: -1 });
    expect(firstModel.rows.find((row) => row.driverName === "Nico Pino")).toMatchObject({ position: 20, lapDelta: -2 });
    const rankedFreshLapDeltas = [
      ...rowsAt(0).filter((row) => row.lapDelta.q === "fresh").map((row) => ({ position: row.position, value: row.lapDelta.v })),
      { position: 10, value: 0 }, // The player is the zero-difference anchor and is omitted from Relative's rival rows.
    ].sort((left, right) => left.position - right.position);
    expect(rankedFreshLapDeltas.map((row) => row.value)).toEqual([2, 1, 1, 0, 0, -1, -2]);
    expect(rankedFreshLapDeltas.every((row, index) => index === 0 || rankedFreshLapDeltas[index - 1]!.value >= row.value)).toBe(true);
    expect(relativeStructureKey(firstModel.rows)).toBe(relativeStructureKey(secondModel.rows));
    expect(relativeDisplayedValues(firstModel).rows).not.toBe(relativeDisplayedValues(secondModel).rows);
  });

  it("shows lap differences only from fresh canonical race values", () => {
    const input = scenario("relative", "relative-functional-lap-difference", 0, "vantare-functional");
    const runtime = buildWorkshopFrameV2(input);
    const widget = createScenarioWidget(input);
    const content = parseRelativeContent(widget.content);
    const frame = runtime.overlayV2Frame!;
    const source = runtime.overlayV2Source!;
    const build = (nextFrame = frame, nextSource = source) =>
      buildRelativeViewModelV2(nextFrame, nextSource, content);
    const p4Lap = (model: ReturnType<typeof build>) =>
      model.rows.find((row) => row.position === 4)?.lapDelta;
    expect(p4Lap(build())).toBe(1);
    expect(p4Lap(build(frame, { ...source, state: "stale" }))).toBeUndefined();
    expect(p4Lap(build({
      ...frame,
      session: { ...frame.session, phase: { q: "stale", v: "race" } },
    }))).toBeNull();

    const staleLapData = {
      ...frame,
      relative: frame.relative.map((row) => row.position === 4 ? { ...row, lapDelta: { q: "stale" as const, v: -1 } } : row),
      relativeSettled: frame.relativeSettled.map((row) => row.position === 4 ? { ...row, lapDelta: { q: "stale" as const, v: -1 } } : row),
    };
    expect(p4Lap(build(staleLapData))).toBeNull();

    const withoutLapData = {
      ...frame,
      relative: frame.relative.map((row) => row.position === 4 ? { ...row, lapDelta: { q: "missing" as const } } : row),
      relativeSettled: frame.relativeSettled.map((row) => row.position === 4 ? { ...row, lapDelta: { q: "missing" as const } } : row),
    };
    expect(p4Lap(build(withoutLapData))).toBeNull();
    const invalidLapData = {
      ...frame,
      relative: frame.relative.map((row) => row.position === 4 ? { ...row, lapDelta: { q: "invalid" as const, v: -1 } } : row),
      relativeSettled: frame.relativeSettled.map((row) => row.position === 4 ? { ...row, lapDelta: { q: "invalid" as const, v: -1 } } : row),
    };
    expect(p4Lap(build(invalidLapData))).toBeNull();
    const fractionalLapData = {
      ...frame,
      relative: frame.relative.map((row) => row.position === 4 ? { ...row, lapDelta: { q: "fresh" as const, v: -1.5 } } : row),
      relativeSettled: frame.relativeSettled.map((row) => row.position === 4 ? { ...row, lapDelta: { q: "fresh" as const, v: -1.5 } } : row),
    };
    expect(p4Lap(build(fractionalLapData))).toBeNull();
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
