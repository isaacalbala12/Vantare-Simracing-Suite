import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { WidgetVisualHost } from "../../core/WidgetVisualHost";
import { parseRelativeContent } from "../../widget-types/relative/relative-content";
import { buildWorkshopFrameV2, buildWorkshopWidget, type WorkshopV2Scenario } from "./authoring-v2-workshop-frame";
import { getAnimationScene } from "./animation-scenes";
import { interpolateSceneAt } from "./scene-interpolation";

afterEach(() => cleanup());

describe("Functional Relative scene window", () => {
  it("refills both sides through a mounted exit and reentry sequence", () => {
    const scene = getAnimationScene("relative-functional-sequence")!;
    const input: WorkshopV2Scenario = {
      session: "practice", location: "track", state: "ready", widget: "relative",
      system: "vantare-functional", variant: "default", sceneId: scene.id,
    };
    const widget = buildWorkshopWidget({ ...input, brand: "off" });
    const content = parseRelativeContent(widget.content);
    const baseline = buildWorkshopFrameV2({ ...input, sceneId: undefined }).overlayV2Frame!;
    const jensenId = baseline.relative.find((row) => row.position === 19)!.id;
    const playerId = baseline.player.id!;
    const runtimeAt = (index: number) => buildWorkshopFrameV2({
      ...input,
      sceneState: interpolateSceneAt(scene, index * scene.frameMs, false).frame,
      rangeAhead: content.rangeAhead,
      rangeBehind: content.rangeBehind,
    });
    const at = (index: number) => <WidgetVisualHost widget={widget} renderMode="harness" runtime={runtimeAt(index)} />;

    const view = render(at(0));
    const player = view.container.querySelector(`[data-relative-row="${playerId}"]`);
    for (let index = 0; index < scene.frames.length; index++) {
      if (index > 0) view.rerender(at(index));
      const rows = [...view.container.querySelectorAll("[data-relative-row]")];
      expect(rows, `frame ${index}`).toHaveLength(7);
      expect(new Set(rows.map((row) => row.getAttribute("data-relative-row"))).size, `frame ${index}`).toBe(7);
      const canonical = runtimeAt(index).overlayV2Frame!.relative;
      const ahead = canonical.filter((row) => row.side === "ahead").slice(0, content.rangeAhead);
      const behind = canonical.filter((row) => row.side === "behind").slice(0, content.rangeBehind);
      expect(rows.map((row) => row.getAttribute("data-relative-row")), `frame ${index}`)
        .toEqual([...ahead].reverse().map((row) => row.id).concat(playerId, behind.map((row) => row.id)));
      expect(view.container.querySelector(`[data-relative-row="${playerId}"]`), `frame ${index}`).toBe(player);
      expect(Boolean(view.container.querySelector(`[data-relative-row="${jensenId}"]`)), `frame ${index}`)
        .toBe(![0, 1, 4].includes(index));
      expect(view.container.querySelectorAll(".vf-relative-empty-slot"), `frame ${index}`).toHaveLength(0);
    }
  });
});
