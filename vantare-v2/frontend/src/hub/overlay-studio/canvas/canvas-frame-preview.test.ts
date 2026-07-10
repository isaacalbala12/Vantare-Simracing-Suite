import { afterEach, describe, expect, it } from "vitest";
import {
  applyStudioFrameLayoutPreview,
  beginStudioFramePreview,
  clearStudioFrameLayoutPreview,
  findStudioFrameElement,
  getStudioFrameLayoutPreview,
  registerStudioFrameElement,
  resetStudioFrameLayoutPreview,
  resolveStudioFrameGeometry,
  studioFrameTestId,
} from "./canvas-frame-preview";

const layout = { x: 120, y: 80, w: 280, h: 96, zIndex: 0, aspectLocked: true };
const start = { x: 100, y: 100, w: 280, h: 96, zIndex: 0, aspectLocked: true };

afterEach(() => {
  document.body.innerHTML = "";
  clearStudioFrameLayoutPreview("delta-main");
});

describe("canvas-frame-preview", () => {
  it("tracks the latest preview layout per widget id", () => {
    beginStudioFramePreview("delta-main", "resize", layout);
    applyStudioFrameLayoutPreview("delta-main", layout);
    expect(getStudioFrameLayoutPreview("delta-main")).toEqual(layout);
    clearStudioFrameLayoutPreview("delta-main");
    expect(getStudioFrameLayoutPreview("delta-main")).toBeUndefined();
  });

  it("writes geometry directly to the frame element on resize", () => {
    const frame = document.createElement("div");
    frame.dataset.testid = studioFrameTestId("delta-main");
    document.body.append(frame);

    beginStudioFramePreview("delta-main", "resize", layout);
    applyStudioFrameLayoutPreview("delta-main", layout);

    const element = findStudioFrameElement("delta-main");
    expect(element?.style.left).toBe("120px");
    expect(element?.style.top).toBe("80px");
    expect(element?.style.width).toBe("280px");
    expect(element?.style.height).toBe("96px");
    expect(element?.style.transform).toBe("");
  });

  it("keeps start geometry and applies transform delta on move", () => {
    const frame = document.createElement("div");
    frame.dataset.testid = studioFrameTestId("delta-main");
    document.body.append(frame);

    beginStudioFramePreview("delta-main", "move", start);
    applyStudioFrameLayoutPreview("delta-main", { ...start, x: 140, y: 130 });

    const element = findStudioFrameElement("delta-main");
    expect(element?.style.left).toBe("100px");
    expect(element?.style.top).toBe("100px");
    expect(element?.style.transform).toBe("translate(40px, 30px)");
  });

  it("clears cached preview layout on reset", () => {
    beginStudioFramePreview("delta-main", "resize", layout);
    applyStudioFrameLayoutPreview("delta-main", layout);
    resetStudioFrameLayoutPreview("delta-main", layout);
    expect(getStudioFrameLayoutPreview("delta-main")).toBeUndefined();
  });

  it("prefers registered frame refs over querySelector", () => {
    const registered = document.createElement("div");
    registerStudioFrameElement("delta-main", registered);
    beginStudioFramePreview("delta-main", "resize", layout);
    applyStudioFrameLayoutPreview("delta-main", layout);
    expect(registered.style.left).toBe("120px");
    registerStudioFrameElement("delta-main", null);
  });

  it("resolves start geometry from cache during move preview", () => {
    beginStudioFramePreview("delta-main", "move", start);
    applyStudioFrameLayoutPreview("delta-main", { ...start, x: 140, y: 130 });
    const committed = { ...start, x: 10, y: 10 };
    expect(resolveStudioFrameGeometry("delta-main", committed, true)).toEqual(start);
    expect(resolveStudioFrameGeometry("delta-main", committed, false)).toEqual(committed);
  });

  it("resolves preview geometry from cache during resize preview", () => {
    beginStudioFramePreview("delta-main", "resize", layout);
    applyStudioFrameLayoutPreview("delta-main", layout);
    const committed = { ...layout, x: 10, y: 10 };
    expect(resolveStudioFrameGeometry("delta-main", committed, true)).toEqual(layout);
    expect(resolveStudioFrameGeometry("delta-main", committed, false)).toEqual(committed);
  });
});