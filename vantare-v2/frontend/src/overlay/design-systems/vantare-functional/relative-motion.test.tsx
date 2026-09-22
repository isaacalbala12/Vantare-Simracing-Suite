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
let animationProgress = 1;
let rectangles: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  animations.length = 0;
  animationProgress = 1;
  rectangles = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const index = this.tagName === "TR" ? [...(this.parentElement?.children ?? [])].indexOf(this) : 0;
    return { top: index * 28, height: 112, width: 300, left: 0, right: 300, bottom: index * 28 + 112, x: 0, y: index * 28, toJSON: () => ({}) };
  });
  Object.defineProperty(HTMLElement.prototype, "animate", { configurable: true, value: vi.fn(function (this: HTMLElement, frames: Keyframe[], options: KeyframeAnimationOptions) {
    const entry = { target: this, frames: frames as Keyframe[], options: options as number | KeyframeAnimationOptions, cancel: vi.fn() };
    animations.push(entry);
    return { cancel: entry.cancel, addEventListener: vi.fn(), effect: { getComputedTiming: () => ({ progress: animationProgress }) } } as unknown as Animation;
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
    const stable = relativeVisibleSlots(model([ahead, player], { rangeBehind: 2 }), 5);
    expect(stable.map((item) => item?.id ?? "empty")).toEqual(["ahead", "player", "empty", "empty"]);
    const near = row("near", "ahead", "+0.4");
    const middle = row("middle", "ahead", "+1.8");
    const far = row("far", "ahead", "+4.2");
    const canonical = model([near, middle, far, player, behind], { rangeAhead: 3 });
    expect(relativeVisibleSlots(canonical, 5).map((item) => item?.id))
      .toEqual(["far", "middle", "near", "player", "behind"]);
    expect(relativeVisibleSlots(canonical, 2).map((item) => item?.id))
      .toEqual(["near", "player"]);
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
    view.rerender(<RelativeFunctional model={model([ahead, player, { ...behind, driverName: "Latest" }])} settings={{}} renderMode="harness" />);
    view.rerender(<RelativeFunctional model={model([ahead, player])} settings={{}} renderMode="harness" />);
    const ghost = view.container.querySelector('[data-relative-ghost="behind"]');
    expect(ghost?.getAttribute("aria-hidden")).toBe("true");
    expect(ghost?.hasAttribute("inert")).toBe(true);
    expect(ghost?.textContent).toContain("Latest");
    expect(view.container.querySelectorAll('[data-relative-row="behind"]')).toHaveLength(0);
    act(() => vi.advanceTimersByTime(60));
    animationProgress = 0.5;
    view.rerender(<RelativeFunctional model={model([ahead, player, behind])} settings={{}} renderMode="harness" />);
    expect(view.container.querySelector('[data-relative-ghost="behind"]')).toBeNull();
    expect(view.container.querySelectorAll('[data-relative-row="behind"]')).toHaveLength(1);
    expect(animations.some((entry) => entry.target === view.container.querySelector('[data-relative-row="behind"]') && entry.frames[0]?.opacity === 0.5)).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    act(() => vi.advanceTimersByTime(120));
    expect(view.container.querySelector("[data-relative-ghost]")).toBeNull();
  });

  it("starts an exit from the rival's current visual position and opacity", () => {
    const view = render(<RelativeFunctional model={model([ahead, player, behind])} settings={{}} renderMode="harness" />);
    view.rerender(<RelativeFunctional model={model([behind, player, ahead])} settings={{}} renderMode="harness" />);
    animationProgress = 0.5;
    view.rerender(<RelativeFunctional model={model([player, ahead])} settings={{}} renderMode="harness" />);
    const ghost = view.container.querySelector<HTMLElement>('[data-relative-ghost="behind"]');
    expect(ghost?.style.top).toBe("28px");
    expect(animations.find((entry) => entry.target === ghost)?.frames[0]?.opacity).toBe(1);
  });

  it("continues opacity through exit, reentry, and another exit without a flash", () => {
    const view = render(<RelativeFunctional model={model([ahead, player, behind])} settings={{}} renderMode="harness" />);
    view.rerender(<RelativeFunctional model={model([ahead, player])} settings={{}} renderMode="harness" />);
    animationProgress = 0.5;
    view.rerender(<RelativeFunctional model={model([ahead, player, behind])} settings={{}} renderMode="harness" />);
    const entrance = animations.findLast((entry) => entry.target === view.container.querySelector('[data-relative-row="behind"]') && entry.frames[0]?.opacity !== undefined);
    expect(entrance?.frames[0]?.opacity).toBe(0.5);
    view.rerender(<RelativeFunctional model={model([ahead, player])} settings={{}} renderMode="harness" />);
    const ghost = view.container.querySelector('[data-relative-ghost="behind"]');
    const exit = animations.findLast((entry) => entry.target === ghost);
    expect(exit?.frames[0]?.opacity).toBe(0.75);
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
    view.rerender(<RelativeFunctional model={model([row("new", "ahead"), player, behind])} settings={{}} renderMode="harness" />);
    expect(cue.cancel).toHaveBeenCalled();
    expect(animations.filter((entry) => entry.frames[0]?.backgroundColor)).toHaveLength(2);
    view.rerender(<RelativeFunctional model={model([behind, player, row("new", "behind")])} settings={{}} motion="minimal" renderMode="harness" />);
    expect(cue.cancel).toHaveBeenCalled();
    const count = animations.length;
    view.rerender(<RelativeFunctional model={model([behind, player, row("new", "behind")], { presentationKey: "session-b" })} settings={{}} motion="full" renderMode="harness" />);
    expect(animations).toHaveLength(count);
  });

  it("resets motion on geometry, source, and unmount without leaving a queued exit", () => {
    vi.useFakeTimers();
    const view = render(<RelativeFunctional model={model([ahead, player, behind])} settings={{}} layout={{ w: 300, h: 180 }} renderMode="harness" />);
    const swapped = model([behind, player, ahead]);
    view.rerender(<RelativeFunctional model={swapped} settings={{}} layout={{ w: 300, h: 180 }} renderMode="harness" />);
    const slides = animations.filter((entry) => entry.frames[0]?.transform);
    expect(slides.length).toBeGreaterThan(0);
    const beforeGeometry = animations.length;
    view.rerender(<RelativeFunctional model={swapped} settings={{}} layout={{ w: 240, h: 180 }} renderMode="harness" />);
    expect(slides.every((entry) => entry.cancel.mock.calls.length > 0)).toBe(true);
    expect(animations).toHaveLength(beforeGeometry);
    const newSource = model([behind, player, ahead], { presentationKey: "new-source" });
    view.rerender(<RelativeFunctional model={newSource} settings={{}} layout={{ w: 240, h: 180 }} renderMode="harness" />);
    expect(animations).toHaveLength(beforeGeometry);
    view.rerender(<RelativeFunctional model={model([behind, player], { presentationKey: "new-source" })} settings={{}} layout={{ w: 240, h: 180 }} renderMode="harness" />);
    const ghost = view.container.querySelector("[data-relative-ghost]");
    expect(ghost).not.toBeNull();
    view.unmount();
    expect(ghost?.isConnected).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });
});
