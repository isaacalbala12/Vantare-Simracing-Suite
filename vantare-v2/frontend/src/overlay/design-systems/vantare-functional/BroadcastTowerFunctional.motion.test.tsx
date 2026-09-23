import { cleanup, render } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BroadcastTowerRow, BroadcastTowerViewModel } from "../../widget-types/broadcast-tower/broadcast-tower-view-model";
import { BroadcastTowerFunctional } from "./BroadcastTowerFunctional";

type RecordedAnimation = {
  node: HTMLElement;
  frames: Keyframe[];
  animation: Animation;
  progress: number;
  canceled: boolean;
};

const records: RecordedAnimation[] = [];
let scale = 1;
let rectReads = 0;
let widthReads = 0;
let originalAnimate: PropertyDescriptor | undefined;
let originalRect: PropertyDescriptor | undefined;
let originalWidth: PropertyDescriptor | undefined;

function makeRow(id: string, place: number, gap = place * 1.1): BroadcastTowerRow {
  return { id, place, number: id, name: `Driver ${id}`, team: "HYPERCAR", className: "HYPERCAR", gap, isPlayer: id === "A" };
}

function makeModel(ids: readonly string[], overrides: Partial<BroadcastTowerViewModel> = {}): BroadcastTowerViewModel {
  return {
    type: "broadcast-tower", status: "ready", sessionLabel: "RACE", motionIdentity: "session:1:0",
    rows: ids.map((id, index) => makeRow(id, index + 1)), rowCount: 3,
    showWeather: false, showSof: false, ...overrides,
  };
}

function rect(left: number, width: number): DOMRect {
  return { x: left, y: 0, left, top: 0, right: left + width, bottom: 71, width, height: 71, toJSON: () => ({}) } as DOMRect;
}

function slideOffset(node: HTMLElement): number {
  const running = records.findLast((record) => record.node === node && !record.canceled && typeof record.frames[0]?.transform === "string");
  const from = Number(/^translateX\((-?[\d.]+)px\)$/.exec(String(running?.frames[0]?.transform))?.[1]);
  return running && Number.isFinite(from) ? from * (1 - running.progress) : 0;
}

function slides(): RecordedAnimation[] {
  return records.filter((record) => typeof record.frames[0]?.transform === "string");
}

function cues(): RecordedAnimation[] {
  return records.filter((record) => typeof record.frames[0]?.backgroundColor === "string");
}

function opacityFades(): RecordedAnimation[] {
  return records.filter((record) => typeof record.frames[0]?.opacity === "number");
}

beforeEach(() => {
  records.length = 0;
  scale = 1;
  rectReads = 0;
  widthReads = 0;
  originalAnimate = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "animate");
  originalRect = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "getBoundingClientRect");
  originalWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetWidth");
  Object.defineProperty(HTMLElement.prototype, "animate", {
    configurable: true,
    value: function (this: HTMLElement, frames: Keyframe[]) {
      const listeners = new Map<string, Array<() => void>>();
      const record = { node: this, frames, progress: 0, canceled: false } as RecordedAnimation;
      record.animation = {
        effect: { getComputedTiming: () => ({ progress: record.progress }) },
        cancel: () => { record.canceled = true; listeners.get("cancel")?.forEach((listener) => listener()); },
        addEventListener: (event: string, listener: () => void) => {
          listeners.set(event, [...(listeners.get(event) ?? []), listener]);
        },
      } as unknown as Animation;
      records.push(record);
      return record.animation;
    },
  });
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
    configurable: true,
    get(this: HTMLElement) { widthReads++; return this.classList.contains("vf-bt-stream") ? 300 : 0; },
  });
  Object.defineProperty(HTMLElement.prototype, "getBoundingClientRect", {
    configurable: true,
    value: function (this: HTMLElement) {
      rectReads++;
      if (this.classList.contains("vf-bt-stream")) return rect(20, 300 * scale);
      if (this.dataset.btRow) {
        const cards = [...(this.parentElement?.querySelectorAll<HTMLElement>("[data-bt-row]") ?? [])];
        return rect(20 + (cards.indexOf(this) * 100 + slideOffset(this)) * scale, 100 * scale);
      }
      return rect(0, 300 * scale);
    },
  });
});

afterEach(() => {
  cleanup();
  for (const [name, descriptor] of [["animate", originalAnimate], ["getBoundingClientRect", originalRect], ["offsetWidth", originalWidth]] as const) {
    if (descriptor) Object.defineProperty(HTMLElement.prototype, name, descriptor);
    else Reflect.deleteProperty(HTMLElement.prototype, name);
  }
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function renderTower(model: BroadcastTowerViewModel, motion: "full" | "reduced" | "minimal" = "full", layout = { w: 360, h: 71 }) {
  return render(<BroadcastTowerFunctional model={model} settings={{}} renderMode="harness" motion={motion} layout={layout} />);
}

describe("Functional horizontal standings motion", () => {
  it("uses canonical IDs and performs no visual work for 100 numeric samples", () => {
    const { container, rerender } = renderTower(makeModel(["A", "B", "C"]));
    const first = container.querySelector('[data-bt-row="A"]');
    const lead = container.querySelector(".vf-bt-lead");
    const side = container.querySelector(".vf-bt-side");
    const baseline = { rectReads, widthReads, animations: records.length };
    const timer = vi.spyOn(globalThis, "setTimeout");
    for (let tick = 1; tick <= 100; tick++) {
      const model = makeModel(["A", "B", "C"]);
      model.rows = model.rows.map((row) => ({ ...row, gap: row.gap! + tick / 1000 }));
      rerender(<BroadcastTowerFunctional model={model} settings={{}} renderMode="harness" motion="full" layout={{ w: 360, h: 71 }} />);
    }
    expect(container.querySelector('[data-bt-row="A"]')).toBe(first);
    expect(container.querySelector(".vf-bt-lead")).toBe(lead);
    expect(container.querySelector(".vf-bt-side")).toBe(side);
    expect({ rectReads, widthReads, animations: records.length }).toEqual(baseline);
    expect(timer).not.toHaveBeenCalled();
  });

  it("slides both reordered cards in local px and retargets from their visual positions", () => {
    scale = 1.5;
    const { container, rerender } = renderTower(makeModel(["A", "B", "C"]));
    rerender(<BroadcastTowerFunctional model={makeModel(["B", "A", "C"])} settings={{}} renderMode="harness" motion="full" layout={{ w: 360, h: 71 }} />);
    expect(slides().map((item) => item.frames[0]?.transform).sort()).toEqual(["translateX(-100px)", "translateX(100px)"]);
    expect(cues()).toHaveLength(2);
    const lead = container.querySelector(".vf-bt-lead");
    for (const slide of slides()) slide.progress = 0.5;
    rerender(<BroadcastTowerFunctional model={makeModel(["A", "B", "C"])} settings={{}} renderMode="harness" motion="full" layout={{ w: 360, h: 71 }} />);
    expect(slides().slice(-2).map((item) => item.frames[0]?.transform).sort()).toEqual(["translateX(-50px)", "translateX(50px)"]);
    expect(container.querySelector(".vf-bt-lead")).toBe(lead);
  });

  it("does not remeasure or restart a slide and entrance during 100 numeric samples", () => {
    const { rerender } = renderTower(makeModel(["A", "B", "C"]));
    rerender(<BroadcastTowerFunctional model={makeModel(["B", "A", "D"])} settings={{}} renderMode="harness" motion="full" layout={{ w: 360, h: 71 }} />);
    expect(slides()).toHaveLength(2);
    expect(opacityFades().some((item) => item.node.dataset.btRow === "D")).toBe(true);
    const baseline = { rectReads, widthReads, animations: records.length };
    const timer = vi.spyOn(globalThis, "setTimeout");
    for (let tick = 1; tick <= 100; tick++) {
      const model = makeModel(["B", "A", "D"]);
      model.rows = model.rows.map((row) => ({ ...row, gap: row.gap! + tick / 1000 }));
      rerender(<BroadcastTowerFunctional model={model} settings={{}} renderMode="harness" motion="full" layout={{ w: 360, h: 71 }} />);
    }
    expect({ rectReads, widthReads, animations: records.length }).toEqual(baseline);
    expect(timer).not.toHaveBeenCalled();
  });

  it("fades exits and reentries without accessible duplicates or a restart from zero", () => {
    const { container, rerender } = renderTower(makeModel(["A", "B", "C"]));
    rerender(<BroadcastTowerFunctional model={makeModel(["B", "C", "D"])} settings={{}} renderMode="harness" motion="full" layout={{ w: 360, h: 71 }} />);
    const ghost = container.querySelector<HTMLElement>('[data-bt-ghost="A"]');
    expect(ghost?.getAttribute("aria-hidden")).toBe("true");
    expect(ghost?.hasAttribute("inert")).toBe(true);
    expect(container.querySelectorAll('[data-bt-row="A"]')).toHaveLength(0);
    const exitFade = opacityFades().find((item) => item.node === ghost);
    expect(exitFade).toBeDefined();
    exitFade!.progress = 0.5;
    rerender(<BroadcastTowerFunctional model={makeModel(["A", "B", "C"])} settings={{}} renderMode="harness" motion="full" layout={{ w: 360, h: 71 }} />);
    expect(container.querySelectorAll('[data-bt-ghost="A"]')).toHaveLength(0);
    expect(container.querySelectorAll('[data-bt-row="A"]')).toHaveLength(1);
    const entrance = opacityFades().findLast((item) => item.node.dataset.btRow === "A");
    expect(entrance?.frames[0]?.opacity).toBe(0.5);
  });

  it("starts an exit from the current opacity of an incomplete entrance", () => {
    const { container, rerender } = renderTower(makeModel(["A", "B", "C"]));
    rerender(<BroadcastTowerFunctional model={makeModel(["B", "C", "D"])} settings={{}} renderMode="harness" motion="full" layout={{ w: 360, h: 71 }} />);
    const entrance = opacityFades().find((item) => item.node.dataset.btRow === "D");
    expect(entrance).toBeDefined();
    entrance!.progress = 0.5;
    rerender(<BroadcastTowerFunctional model={makeModel(["B", "C"])} settings={{}} renderMode="harness" motion="full" layout={{ w: 360, h: 71 }} />);
    const ghost = container.querySelector<HTMLElement>('[data-bt-ghost="D"]');
    const exit = opacityFades().find((item) => item.node === ghost);
    expect(exit?.frames[0]?.opacity).toBe(0.5);
    exit!.progress = 0.5;
    rerender(<BroadcastTowerFunctional model={makeModel(["B", "C", "D"])} settings={{}} renderMode="harness" motion="full" layout={{ w: 360, h: 71 }} />);
    const resumed = opacityFades().findLast((item) => item.node.dataset.btRow === "D");
    expect(resumed?.frames[0]?.opacity).toBe(0.25);
  });

  it("keeps reduced to slides and minimal to static cards; geometry changes reset the origin", () => {
    const initial = makeModel(["A", "B", "C"]);
    const { rerender } = renderTower(initial, "reduced");
    rerender(<BroadcastTowerFunctional model={makeModel(["B", "A", "C"])} settings={{}} renderMode="harness" motion="reduced" layout={{ w: 360, h: 71 }} />);
    expect(slides()).toHaveLength(2);
    expect(cues()).toHaveLength(0);
    expect(opacityFades()).toHaveLength(0);
    const count = records.length;
    rerender(<BroadcastTowerFunctional model={makeModel(["B", "A", "C"])} settings={{}} renderMode="harness" motion="minimal" layout={{ w: 360, h: 71 }} />);
    rerender(<BroadcastTowerFunctional model={makeModel(["A", "B", "C"])} settings={{}} renderMode="harness" motion="minimal" layout={{ w: 360, h: 71 }} />);
    expect(records).toHaveLength(count);
    rerender(<BroadcastTowerFunctional model={makeModel(["A", "B", "C"])} settings={{}} renderMode="harness" motion="full" layout={{ w: 540, h: 71 }} />);
    expect(records).toHaveLength(count);
  });

  it("does not mistake entry or exit for an overtaking cue and resets on a new source", () => {
    const { rerender } = renderTower(makeModel(["A", "B", "C"]));
    rerender(<BroadcastTowerFunctional model={makeModel(["X", "A", "B"])} settings={{}} renderMode="harness" motion="full" layout={{ w: 360, h: 71 }} />);
    expect(cues()).toHaveLength(0);
    const count = records.length;
    rerender(<BroadcastTowerFunctional model={makeModel(["B", "A", "X"], { motionIdentity: "other:2:0" })} settings={{}} renderMode="harness" motion="full" layout={{ w: 360, h: 71 }} />);
    expect(records).toHaveLength(count);
  });

  it("leaves ambiguous legacy rows unanimated", () => {
    const legacy = makeModel(["A", "B", "C"]);
    legacy.rows = legacy.rows.map((row) => ({ ...row, id: undefined }));
    const { rerender } = renderTower(legacy);
    rerender(<BroadcastTowerFunctional model={{ ...legacy, rows: [...legacy.rows].reverse() }} settings={{}} renderMode="harness" motion="full" layout={{ w: 360, h: 71 }} />);
    expect(records).toHaveLength(0);
    expect(rectReads).toBe(0);
  });

  it("clears ghost timers and animations on a StrictMode unmount", () => {
    vi.useFakeTimers();
    const renderModel = (model: BroadcastTowerViewModel) => (
      <StrictMode><BroadcastTowerFunctional model={model} settings={{}} renderMode="harness" motion="full" layout={{ w: 360, h: 71 }} /></StrictMode>
    );
    const { rerender, unmount } = render(renderModel(makeModel(["A", "B", "C"])));
    rerender(renderModel(makeModel(["B", "C", "D"])));
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
    expect(records.filter((item) => !item.canceled)).toHaveLength(0);
  });
});
