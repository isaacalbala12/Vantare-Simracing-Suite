import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RelativeRowViewModel, RelativeViewModel } from "../../widget-types/relative/relative-view-model";
import { RelativeFunctional } from "./RelativeFunctional";
import { relativeVisibleSlots } from "./relative-presentation";

const row = (id: string, side: RelativeRowViewModel["side"], gapText = "+1.0"): RelativeRowViewModel => ({
  id, position: 1, vehicleClass: "GT3", driverNumber: id, driverName: id,
  gapText, bestLapText: "1:40", lastLapText: "1:41", isPlayer: side === "player",
  side, tone: side, gapSeconds: 1,
});
const ahead = row("ahead", "ahead");
const player = row("player", "player");
const behind = row("behind", "behind");
const model = (rows: RelativeRowViewModel[], extras: Partial<RelativeViewModel> = {}): RelativeViewModel => ({
  type: "relative", status: "ready", rowHeightMode: "auto", presentationKey: "session-a",
  rangeAhead: 1, rangeBehind: 1,
  columns: [{ id: "name", metricId: "driverName", enabled: true, widthPreset: "auto" }],
  rows, ...extras,
});

const animations: Array<{ target: Element; frames: Keyframe[]; options: number | KeyframeAnimationOptions; cancel: ReturnType<typeof vi.fn> }> = [];
let rectangles: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  animations.length = 0;
  rectangles = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const index = this.tagName === "TR" ? [...(this.parentElement?.children ?? [])].indexOf(this) : 0;
    return { top: index * 28, height: 112, width: 300, left: 0, right: 300, bottom: index * 28 + 112, x: 0, y: index * 28, toJSON: () => ({}) };
  });
  Object.defineProperty(HTMLElement.prototype, "animate", { configurable: true, value: vi.fn(function (this: HTMLElement, frames: Keyframe[], options: KeyframeAnimationOptions) {
    const entry = { target: this, frames: frames as Keyframe[], options: options as number | KeyframeAnimationOptions, cancel: vi.fn() };
    animations.push(entry);
    return { cancel: entry.cancel, addEventListener: vi.fn() } as unknown as Animation;
  }) });
  Object.defineProperty(HTMLElement.prototype, "getAnimations", { configurable: true, value: vi.fn(() => []) });
});

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); delete (HTMLElement.prototype as { animate?: unknown }).animate; delete (HTMLElement.prototype as { getAnimations?: unknown }).getAnimations; });

describe("Relative presentation", () => {
  it("anchors the visible player with empty, inaccessible slots and respects clipping or a hidden player", () => {
    expect(relativeVisibleSlots(model([player, behind], { rangeAhead: 3 }), 5).map((item) => item?.id ?? "empty"))
      .toEqual(["empty", "empty", "empty", "player", "behind"]);
    expect(relativeVisibleSlots(model([ahead, player, behind], { rangeAhead: 3 }), 2).map((item) => item?.id ?? "empty"))
      .toEqual(["ahead", "player"]);
    expect(relativeVisibleSlots(model([ahead, behind], { rangeAhead: 3 }), 5).map((item) => item?.id))
      .toEqual(["ahead", "behind"]);
    const view = render(<RelativeFunctional model={model([player, behind], { rangeAhead: 2 })} settings={{}} renderMode="harness" />);
    expect(view.container.querySelectorAll(".vf-relative-empty-slot")).toHaveLength(2);
    expect(view.container.querySelectorAll("[data-relative-row]")).toHaveLength(2);
    expect(view.container.querySelectorAll(".vf-relative-empty-slot[aria-hidden=true]")).toHaveLength(2);
  });

  it("seeds the first frame, slides rivals without moving the player, and ignores 100 numeric frames", () => {
    const first = model([ahead, player, behind]);
    const view = render(<RelativeFunctional model={first} settings={{}} renderMode="harness" />);
    expect(animations).toHaveLength(0);
    const playerNode = view.container.querySelector('[data-player="true"]');
    view.rerender(<RelativeFunctional model={model([behind, player, ahead])} settings={{}} renderMode="harness" />);
    expect(view.container.querySelector('[data-player="true"]')).toBe(playerNode);
    const slides = animations.filter((entry) => entry.frames[0]?.transform);
    expect(slides).toHaveLength(2);
    expect(slides.every((entry) => (entry.options as KeyframeAnimationOptions).duration! >= 220 && (entry.options as KeyframeAnimationOptions).duration! <= 300)).toBe(true);
    expect(slides.every((entry) => entry.target !== playerNode)).toBe(true);
    const readings = rectangles.mock.calls.length;
    const effects = animations.length;
    const timer = vi.spyOn(globalThis, "setTimeout");
    for (let tick = 0; tick < 100; tick++) {
      view.rerender(<RelativeFunctional model={model([behind, player, { ...ahead, gapText: `+${tick}` }])} settings={{}} renderMode="harness" />);
    }
    expect(rectangles.mock.calls.length).toBe(readings);
    expect(animations).toHaveLength(effects);
    expect(timer).not.toHaveBeenCalled();
  });

  it("fades entry and an inert exit briefly; a fast reentry removes the ghost", () => {
    vi.useFakeTimers();
    const view = render(<RelativeFunctional model={model([ahead, player, behind])} settings={{}} renderMode="harness" />);
    view.rerender(<RelativeFunctional model={model([ahead, player])} settings={{}} renderMode="harness" />);
    const ghost = view.container.querySelector('[data-relative-ghost="behind"]');
    expect(ghost?.getAttribute("aria-hidden")).toBe("true");
    expect(ghost?.hasAttribute("inert")).toBe(true);
    expect(view.container.querySelectorAll('[data-relative-row="behind"]')).toHaveLength(0);
    view.rerender(<RelativeFunctional model={model([ahead, player, behind])} settings={{}} renderMode="harness" />);
    expect(view.container.querySelector('[data-relative-ghost="behind"]')).toBeNull();
    expect(view.container.querySelectorAll('[data-relative-row="behind"]')).toHaveLength(1);
    expect(animations.some((entry) => entry.target === view.container.querySelector('[data-relative-row="behind"]') && entry.frames[0]?.opacity === 0)).toBe(true);
    act(() => vi.advanceTimersByTime(120));
    expect(view.container.querySelector("[data-relative-ghost]")).toBeNull();
  });

  it("shows one four-percent cue only for a real side crossing and clears motion on minimal or scope change", () => {
    const view = render(<RelativeFunctional model={model([ahead, player, behind])} settings={{}} renderMode="harness" />);
    view.rerender(<RelativeFunctional model={model([row("new", "ahead"), player, behind])} settings={{}} renderMode="harness" />);
    expect(animations.some((entry) => entry.frames[0]?.backgroundColor)).toBe(false);
    view.rerender(<RelativeFunctional model={model([behind, player, row("new", "behind")])} settings={{}} renderMode="harness" />);
    const cues = animations.filter((entry) => entry.frames[0]?.backgroundColor);
    expect(cues).toHaveLength(1);
    expect(cues[0]?.frames[0]?.backgroundColor).toBe("rgb(127 182 134 / 4%)");
    const cue = cues[0]!;
    view.rerender(<RelativeFunctional model={model([behind, player, row("new", "behind")])} settings={{}} motion="minimal" renderMode="harness" />);
    expect(cue.cancel).toHaveBeenCalled();
    const count = animations.length;
    view.rerender(<RelativeFunctional model={model([behind, player, row("new", "behind")], { presentationKey: "session-b" })} settings={{}} motion="full" renderMode="harness" />);
    expect(animations).toHaveLength(count);
  });
});
